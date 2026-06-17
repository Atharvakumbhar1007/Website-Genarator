import express from "express";
import Groq from "groq-sdk";
import { BASE_PROMPT, getSystemPrompt } from "./prompts";
import {basePrompt as nodeBasePrompt} from "./deafults/node";
import {basePrompt as reactBasePrompt} from "./deafults/react";
import cors from "cors";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

dotenv.config();

const app = express();
const port = 4000;
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Use your own API Key
const groq = new Groq({ apiKey: "" });

const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const execAsync = promisify(exec);

// FileItem interface (matches frontend type)
interface FileItem {
  name: string;
  type: 'file' | 'folder';
  children?: FileItem[];
  content?: string;
  path: string;
}

// Recursively write FileItem[] to disk
async function writeFilesToDisk(files: FileItem[], basePath: string): Promise<void> {
  for (const file of files) {
    const fullPath = path.join(basePath, file.path);
    if (file.type === 'folder') {
      await fs.mkdir(fullPath, { recursive: true });
      if (file.children) {
        await writeFilesToDisk(file.children, basePath);
      }
    } else {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.content || '', 'utf-8');
    }
  }
}

// Patch vite.config.ts to use relative paths
async function patchViteConfig(projectDir: string): Promise<void> {
  const viteConfigPath = path.join(projectDir, 'vite.config.ts');
  try {
    let content = await fs.readFile(viteConfigPath, 'utf-8');
    if (!content.includes("base:")) {
      content = content.replace(
        'export default defineConfig({',
        "export default defineConfig({\n  base: './',"
      );
      await fs.writeFile(viteConfigPath, content, 'utf-8');
    }
  } catch {
    console.log("[deploy] No vite.config.ts found, skipping patch");
  }
}

// Read all files from dist/ folder
async function readDistFiles(dirPath: string, basePath: string = ''): Promise<{ filePath: string; content: Buffer }[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const results: { filePath: string; content: Buffer }[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...await readDistFiles(fullPath, relativePath));
    } else {
      results.push({ filePath: relativePath, content: await fs.readFile(fullPath) });
    }
  }
  return results;
}

// Upload file to S3 with correct MIME type
async function uploadToS3(fileContent: Buffer, s3Key: string, bucketName: string): Promise<void> {
  const contentType = mime.lookup(s3Key) || 'application/octet-stream';
  await s3Client.send(new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    Body: fileContent,
    ContentType: contentType,
  }));
}

app.post("/template", async (req,res) => {
  try {
    const prompt = req.body.prompt;
    const response = await groq.chat.completions.create({
        messages: [
            { role: "user", content: prompt },
            { role: "system", content: "Return either node or react based on what do you think this project should be. Only return a single word either 'node' or 'react'. Do not return anything extra" },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.5,
    });

    const answer = (response.choices[0].message.content)?.toLowerCase();
    console.log(answer);

    if (answer === "node") {
        res.json({
            prompts: [`Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${nodeBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
            uiPrompts: [nodeBasePrompt]
        });
    } else {
        res.json({
            prompts: [BASE_PROMPT, `Here is an artifact that contains all files of the project visible to you.\nConsider the contents of ALL files in the project.\n\n${reactBasePrompt}\n\nHere is a list of files that exist on the file system but are not being shown to you:\n\n  - .gitignore\n  - package-lock.json\n`],
            uiPrompts: [reactBasePrompt]
        });
    }
  } catch (error: any) {
    console.error('[template] Error:', error.message);
    res.status(500).json({ error: 'Template generation failed', message: error.message });
  }
});



app.post("/chat", async (req,res) => {
  try {
    const message = req.body.message;
    let neededresponse = "";
    message.push({ role: "system", content: getSystemPrompt() });

    const responseStream = await groq.chat.completions.create({
        messages: message,
        model: "llama-3.3-70b-versatile",
        temperature: 1,
        stream: true,
        max_tokens: 8000,
    });

    for await (const chunk of responseStream) {
        const content = chunk.choices[0]?.delta?.content || "";
        neededresponse += content;
        process.stdout.write(content);
    }

    res.json({ response: neededresponse });
  } catch (error: any) {
    console.error('[chat] Error:', error.message);
    res.status(500).json({ error: 'Chat failed', message: error.message });
  }
});

// Deploy endpoint - builds project and uploads to S3
app.post("/deploy", async (req, res) => {
  const { files, projectSlug }: { files: FileItem[]; projectSlug: string } = req.body;
  const slug = projectSlug || uuidv4();
  const bucketName = process.env.S3_BUCKET_NAME!;
  const region = process.env.AWS_REGION!;

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'web-deploy-'));

  try {
    console.log(`[deploy] Writing files to ${tempDir}`);
    await writeFilesToDisk(files, tempDir);

    await patchViteConfig(tempDir);

    console.log(`[deploy] Running npm install...`);
    const { stdout: installOut, stderr: installErr } = await execAsync(
      'npm install', { cwd: tempDir, timeout: 120000 }
    );
    console.log('[deploy] npm install done');
    if (installErr) console.log('[deploy] npm install stderr:', installErr);

    console.log(`[deploy] Running npm run build...`);
    const { stdout: buildOut, stderr: buildErr } = await execAsync(
      'npm run build', { cwd: tempDir, timeout: 120000 }
    );
    console.log('[deploy] build done');
    if (buildErr) console.log('[deploy] build stderr:', buildErr);

    const distPath = path.join(tempDir, 'dist');
    const distFiles = await readDistFiles(distPath);
    console.log(`[deploy] Uploading ${distFiles.length} files to S3...`);

    for (const file of distFiles) {
      const s3Key = `${slug}/${file.filePath}`;
      await uploadToS3(file.content, s3Key, bucketName);
    }

    const deployedUrl = `http://${bucketName}.s3-website.${region}.amazonaws.com/${slug}/`;
    console.log(`[deploy] Deployed at: ${deployedUrl}`);

    res.json({ url: deployedUrl, slug });

  } catch (error: any) {
    console.error('[deploy] Error:', error.message);
    res.status(500).json({
      error: 'Deployment failed',
      message: error.message,
    });
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {
      console.error('[deploy] Cleanup error:', cleanupErr);
    }
  }
});

app.listen(port, () => {
    console.log(`Port is listening at ${port}`);
});

















// export async function main() {
//   const stream = await getGroqChatStream();
//   let response = "";
//   for await (const chunk of stream) {
//     // Append the chunk content to the response string
//     const content = chunk.choices[0]?.delta?.content || "";
//     response += content;
//     // Print the response continuously as it's being built
//     process.stdout.write(content);  // This ensures continuous printing without a new line
//   }
// }


// export async function getGroqChatStream() {
//   return groq.chat.completions.create({
//     messages: [
//       {
//         role: "user",
//         content: BASE_PROMPT,
//       },
//       {
//         role: "user",
//         content: "",
//       },
//       {
//         role: "user",
//         content: "create a todo app in react",
//       },
//       {
//         role: "system",
//         content: getSystemPrompt(),
//       },
//     ],
//     model: "llama-3.3-70b-versatile",
//     temperature: 0.9,
//     stream: true,
//   });
// }


