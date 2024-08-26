/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import HTMLParser from './htmlparser';
try {
  // Load your HTML file
  const filePath = 'src/utils/lwcparser/input/test.html';
  // const html = fs.readFileSync(filePath, 'utf8');

  try {
    const parser = new HTMLParser(filePath);
    // parser.getTagLocation('omnistudio-input');
    parser.replaceCustomTag('omnistudio-input', 'c-input');
    parser.saveToFile('src/utils/lwcparser/output/test.html');
  } catch (error) {
    console.error('An error occurred:', error);
  }

  // eslint-disable-next-line no-console
  console.log('Custom tags replaced successfully.');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error processing HTML:', error);
}
