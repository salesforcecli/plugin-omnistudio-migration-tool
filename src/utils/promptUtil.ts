import { Messages } from '@salesforce/core';

export class PromptUtil {
  public static askWithTimeOut(
    messages: Messages
  ): (promptFn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]) => Promise<string> {
    return async (promptFn: (...args: unknown[]) => Promise<unknown>, ...args: unknown[]): Promise<string> => {
      const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      let timeoutHandle: NodeJS.Timeout;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(messages.getMessage('requestTimedOut')));
        }, TIMEOUT_MS);
      });
      try {
        const result = await Promise.race([promptFn(...args), timeoutPromise]);
        clearTimeout(timeoutHandle);
        if (typeof result === 'string') {
          return result;
        } else {
          throw new Error('Prompt did not return a string');
        }
      } catch (err) {
        clearTimeout(timeoutHandle);
        throw err;
      }
    };
  }
}
