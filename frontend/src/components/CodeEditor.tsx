import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { FileItem } from '../types';

interface CodeEditorProps {
  file: FileItem | null;
  onUpdateFileContent: (content: string) => void;
}

export function CodeEditor({ file, onUpdateFileContent }: CodeEditorProps) {
  const [localContent, setLocalContent] = useState(file?.content || '');
  const [isModified, setIsModified] = useState(false);

  useEffect(() => {
    // Reset local content and modified state when a new file is selected
    setLocalContent(file?.content || '');
    setIsModified(false);
  }, [file]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setLocalContent(value); // Update the local state
      setIsModified(value !== file?.content); // Check if the content has been modified
    }
  };

  const handleSave = () => {
    onUpdateFileContent(localContent); // Update the file content globally
    setIsModified(false); // Reset the modified state after saving
  };

  const handleEditorWillMount = (monaco: any) => {
    // Configure TypeScript settings
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest, // Set the latest ECMAScript version
      allowNonTsExtensions: true, // Allow JavaScript files
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs, // Use Node.js module resolution
      module: monaco.languages.typescript.ModuleKind.CommonJS, // Use CommonJS modules
      noEmit: true, // Don't emit output (for editor use only)
      esModuleInterop: true, // Enable ES module interop
      jsx: monaco.languages.typescript.JsxEmit.React, // Enable JSX for React
      reactNamespace: "React", // React namespace configuration
      allowJs: true, // Allow JavaScript files
      strict: true, // Enable all strict type-checking options
      typeRoots: ["node_modules/@types"], // Ensure the type definitions are available
      skipLibCheck: true, // Skip library file checks for faster compilation
      resolveJsonModule: true, // Allow JSON modules
      lib: ['esnext', 'dom'], // Specify the libraries to include in the environment
    });

    // Add basic React types
    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      declare module 'react' {
        export = React;
      }
      declare namespace React {
        function useState<T>(initialState: T): [T, (newState: T) => void];
        function useEffect(effect: () => void, deps?: any[]): void;
      }
    `, 'react.d.ts');

    // You can also add more custom types if needed
    monaco.languages.typescript.typescriptDefaults.addExtraLib(`
      // Custom types or libraries can be added here
    `, 'custom.d.ts');
  };

  if (!file) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        Select a file to view its contents
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      <div className="relative h-full">
        {/* Save button */}
        {isModified && (
          <button
            className="absolute top-4 right-4 bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
            style={{zIndex:"1"}}
            onClick={handleSave}
          >
            Save
          </button>
        )}

        {/* Code editor */}
        <Editor
          height="100%"
          defaultLanguage="typescript"
          theme="vs-dark"
          value={localContent}
          beforeMount={handleEditorWillMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            wordWrap: 'on',
            scrollBeyondLastLine: false,
          }}
          onChange={handleEditorChange}
        />
      </div>
    </div>
  );
}
