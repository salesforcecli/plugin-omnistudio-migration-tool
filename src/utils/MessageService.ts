import { Messages } from '@salesforce/core';
import { Tokens } from '@salesforce/core/lib/messages';

class MessagesService {
  private commonMessages: Messages;
  private bundledMessages: Messages;

  public constructor() {
    Messages.importMessagesDirectory(__dirname);
    this.commonMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', 'common');
  }

  public getMessage(key: string, tokens?: Tokens): string {
    let msg = this.getMessageFromInstance(this.bundledMessages, key, tokens);
    if (msg === undefined) {
      msg = this.getMessageFromInstance(this.commonMessages, key, tokens);
    }

    if (msg === undefined) {
      throw new Error(`Message not found for key: ${key}`);
    }

    return msg;
  }

  public init(bundleName: string): void {
    this.bundledMessages = Messages.loadMessages('@salesforce/plugin-omnistudio-migration-tool', bundleName);
  }

  private getMessageFromInstance(messages: Messages, key: string, tokens?: Tokens): string {
    if (!messages) {
      return undefined;
    }
    try {
      return messages.getMessage(key, tokens);
    } catch (error) {
      return undefined;
    }
  }
}

export const MessageService = new MessagesService();
