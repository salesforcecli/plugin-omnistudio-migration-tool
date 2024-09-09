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
