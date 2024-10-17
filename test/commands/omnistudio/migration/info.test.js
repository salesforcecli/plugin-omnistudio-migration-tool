"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var test_1 = require("@salesforce/command/lib/test");
var ts_types_1 = require("@salesforce/ts-types");
describe('omnistudio:migration:info', function () {
    test_1.test
        .withOrg({ username: 'test@org.com' }, true)
        .withConnectionRequest(function (request) {
        var requestMap = (0, ts_types_1.ensureJsonMap)(request);
        if (/Organization/.exec((0, ts_types_1.ensureString)(requestMap.url))) {
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
        .it('runs omnistudio:migration:info --targetusername test@org.com --allversions', function (ctx) {
        (0, test_1.expect)(ctx.stdout).to.contain('Hello world! This is org: Super Awesome Org');
    });
});
