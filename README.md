OmniStudio Migration Tool
=========================


### Before You Begin
1. Confirm you have an OmniStudio Admin license.
2. Enable Standard OmniStudio Runtime in Setup > OmniStudio Settings.

## Running SFDX plugin

1. Install SFDX cli using the official documentation located [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).
2. Authenticate your SFDX cli into the org you are going to use for development. You can follow authentication steps [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_auth_web.htm).
3. In a new terminal session, install the plugin using the following command
```
sfdx plugins:install @salesforce/plugin-omnistudio-migration-tool
```
4. To run the migration tool, run the following command from your command line tool:
```
// To migrate everything
sfdx omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM --namespace=VLOCITY_PACKAGE_NAMESPACE

//to migrate specific components: FlexCards, DataRaptors, Integration Procedures, or OmniScripts, add the following parameters:
--only=dr
--only=ip
--only=os
--only=fc
```
5. An HTML page will be open in your default browser with the results of your migration job.

### Usage & parameters

```
USAGE
  $ sfdx omnistudio:migration:migrate [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel 
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -n, --namespace=namespace                                                         the namespace of the vertical package

  -u, --targetusername=targetusername                                               username or alias for the target
                                                                                    org; overrides default target org

  -v, --targetdevhubusername=targetdevhubusername                                   username or alias for the dev hub
                                                                                    org; overrides default dev hub org

  --apiversion=apiversion                                                           override the api version used for
                                                                                    api requests made by this command

  --json                                                                            format output as json

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

```