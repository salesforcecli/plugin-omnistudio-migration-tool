/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
export class jsonutil {
  // Recursive method to find a property in the JSON
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static findProperty(obj: any, propertyName: string): any {
    if (obj === null || typeof obj !== 'object') {
      return null;
    }

    // Check if the property exists in the current object
    if (propertyName in obj) {
      return obj[propertyName];
    }

    // If it's an array, use findInArray
    if (Array.isArray(obj)) {
      return this.findInArray(obj, propertyName);
    }

    // Otherwise, search through all keys
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const result = this.findProperty(obj[key], propertyName);
        if (result !== null) {
          return result;
        }
      }
    }

    return null; // Property not found
  }

  // Method to find a property in an array
  public static findInArray(arr: any[], propertyName: string): any {
    for (const item of arr) {
      const result = jsonutil.findProperty(item, propertyName);
      if (result !== null) {
        return result;
      }
    }
    return null; // Property not found in the array
  }
}
