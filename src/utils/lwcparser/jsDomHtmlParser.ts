import fs from 'fs';
import { JSDOM } from 'jsdom';

// Function to replace all <omnistudio-input> tags with <c-input>
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function replaceOmnistudioInput() {
  const filePath = '/Users/spachbhai/os-migration/plugin-omnistudio-migration-tool/src/utils/lwcparser/test.html';
  const fileContent = fs.readFileSync(filePath).toString();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
  const dom = new JSDOM(fileContent);
  const document = dom.window.document;
  // Select all <omnistudio-input> elements in the document
  const elements = document.querySelectorAll('omnistudio-input');

  // Iterate over each element found
  elements.forEach((element) => {
    // Create a new <c-input> element
    const newElement = document.createElement('c-input');

    // Copy the content and attributes from the old element to the new one
    newElement.innerHTML = element.innerHTML;

    // Copy all attributes from the old element to the new one
    Array.from(element.attributes).forEach((attr) => {
      newElement.setAttribute(attr.name, attr.value);
    });

    // Replace the old element with the new one in the DOM
    element.replaceWith(newElement);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    fs.writeFile('src/utils/lwcparser/output/lwc.html', document.body.innerHTML, (err) => {
      // eslint-disable-next-line no-console
      if (err) console.log(err);
      else {
        // eslint-disable-next-line no-console
        console.log('File written successfully\n');
      }
    });
    // eslint-disable-next-line no-console
    // console.log(dom.window.document.body);
  });
}

// Call the function to perform the replacement
replaceOmnistudioInput();
