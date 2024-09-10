import { HTMLParser } from '../htmlparser/HTMLParser'; // Adjust the path as needed

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
const parse = new HTMLParser(
  '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/input/test.html'
);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
parse.replaceTags('vlocity_ins');
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
parse.saveToFile('/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/output/test.html');
// eslint-disable-next-line no-console, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
console.log(parse.getModifiedHTML());
