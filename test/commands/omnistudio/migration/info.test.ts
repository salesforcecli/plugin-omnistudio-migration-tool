import { expect, test } from '@salesforce/command/lib/test';
import { ensureJsonMap, ensureString } from '@salesforce/ts-types';

describe('omnistudio:migration:info', () => {
  test
    .withOrg({ username: 'test@org.com' }, true)
    .withConnectionRequest((request) => {
      const requestMap = ensureJsonMap(request);
      if (/Organization/.exec(ensureString(requestMap.url))) {
        return Promise.resolve({
          records: [
            {
              Name: 'Super Awesome Org',
              TrialExpirationDate: '2018-03-20T23:24:11.000+0000',
            },
          ],
        });
      }
      return Promise.resolve({ records: [] });
    })
    .stdout()
    .command(['omnistudio:migration:info', '--targetusername', 'test@org.com', '--allversions'])
    .it('runs omnistudio:migration:info --targetusername test@org.com --allversions', (ctx) => {
      expect(ctx.stdout).to.contain('Hello world! This is org: Super Awesome Org');
    });
});
