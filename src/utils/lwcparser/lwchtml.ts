import * as fs from 'fs';
import * as cheerio from 'cheerio';

try {
  // Load your HTML file
  const filePath = 'src/utils/lwcparser/input/test.html';
  const html = fs.readFileSync(filePath, 'utf8');

  // Load HTML into cheerio
  const modifiedHtml = processHtml(html);

  // Save the modified HTML back to the file or another file
  fs.writeFileSync(filePath, modifiedHtml);

  // eslint-disable-next-line no-console
  console.log('Custom tags replaced successfully.');
} catch (error) {
  // eslint-disable-next-line no-console
  console.error('Error processing HTML:', error);
}
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function processHtml(html: string) {
  const $ = cheerio.load(html);

  // Replace <mytag> with <div>
  $('omnistudio-input').each((_, element) => {
    // Create a new div element with the same content
    const newElement = $('<c-input></c-input>').html($(element).html());

    // Replace the old element with the new one
    $(element).replaceWith(newElement);
  });

  // Get the modified HTML
  const modifiedHtml = $.html();
  return modifiedHtml;
}
