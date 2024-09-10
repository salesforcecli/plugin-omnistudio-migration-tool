import * as fs from 'fs';
import * as path from 'path';

export class fileutil {
  public static readFilesSync(dir: string): File[] {
    const files: File[] = [];
    fs.readdirSync(dir).forEach((filename) => {
      const name = path.parse(filename).name;
      const ext = path.parse(filename).ext;
      const filepath = path.resolve(dir, filename);
      const stat = fs.statSync(filepath);
      const isFile = stat.isFile();

      if (isFile) files.push(new File(name, filepath, ext));
    });
    return files;
  }

  public static readAllFiles(dirPath: string, fileList: File[] = []): File[] {
    // Read the directory contents
    const files = fs.readdirSync(dirPath);

    files.forEach((filename) => {
      // Construct the full file/directory path
      const filePath = path.join(dirPath, filename);

      // Check if the current path is a directory or a file
      if (fs.statSync(filePath).isDirectory()) {
        // If it's a directory, recurse into it
        fileutil.readAllFiles(filePath, fileList);
      } else {
        const name = path.parse(filename).name;
        const ext = path.parse(filename).ext;
        const filepath = path.resolve(dirPath, filename);
        const stat = fs.statSync(filepath);
        const isFile = stat.isFile();
        // If it's a file, add it to the fileList
        if (isFile) fileList.push(new File(name, filepath, ext));
      }
    });

    return fileList;
  }
}
export class File {
  public name: string;
  public location: string;
  public ext: string;
  public constructor(name: string, location: string, ext: string) {
    this.name = name;
    this.location = location;
    this.ext = ext;
  }
}
