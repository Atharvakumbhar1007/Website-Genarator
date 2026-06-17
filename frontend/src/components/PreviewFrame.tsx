import { WebContainer } from '@webcontainer/api';
import { Terminal } from '@xterm/xterm';
import { SetStateAction, useEffect, useState } from 'react';

interface PreviewFrameProps {
  webContainer: any;
  files: any;
  url:string;
  // isUrlSet: boolean;
  // setIsUrlSet: (value: boolean) => void;
  // terminal:Terminal;
}

export function PreviewFrame({ files, webContainer,url}: PreviewFrameProps) {
  // In a real implementation, this would compile and render the preview
  // const [url, setUrl] = useState("");

  // async function main() {
  //   try {
      
  //     // const installProcess = await webContainer.spawn('npm', ['install']);
  //     // installProcess.output.pipeTo(new WritableStream({
  //     //   write(data) {
  //     //     console.log('npm install:', data);
  //     //   }
  //     // }));

  //     // await installProcess.exit;  // Ensure `npm install` completes
      
      
     

      

      

  //       const runDevCommand = await webContainer.spawn('npm', ['run', 'dev']);
    
  //       runDevCommand.output.pipeTo(new WritableStream({
  //         write(data) {
  //           console.log(data);
  //           // terminal.write(data);  
  //         }
  //       }));

       

       
      
      
  
  //     // runDevCommand.exit.then(code => {
  //     //   console.log(`npm run dev exited with code ${code}`);
  //     // });
  
      
  //   webContainer.on('server-ready', (port: any, serverUrl: SetStateAction<string>) => {
  //     setUrl(serverUrl);
  //   });
  //   } catch (error) {
  //     console.error("Error during WebContainer setup:", error);
  //   }
  // }
  

  // useEffect(() => {
  //   main();
  // }, []);

  return (
    <div className="h-full flex items-center justify-center text-gray-400">
      {!url && <div className="text-center">
        <p className="mb-2">Loading...</p>
      </div>}
      {url && <iframe width={"100%"} height={"100%"} src={url} />}
    </div>
  );
}
