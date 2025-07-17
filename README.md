# OmniStudio Migration Assistant

The Omnistudio Migration Assistant is a command-line interface (CLI) plugin that you install via Salesforce CLI. It creates records for your omnistudio components on the Salesforce standard objects.

### Before You Begin

- Review the migration phases in [Migration Process from Omnistudio for Managed Packages to Omnistudio](https://help.salesforce.com/s/articleView?id=xcloud.os_migrate_omnistudio_custom_objects_to_standard_objects.htm&language=en_US&type=5)

- Install Salesforce CLI on your computer. See : [Install Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).

## Install and Run the Omnistudio Migration Assistant

1. Install SF cli using the official documentation located [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).
2. Authenticate Salesforce CLI in your migration sandbox (the org you are going to use for development) using the `sf org login web` command and then enter your username and password in the new browser tab that appears. See [Salesforce CLI Command Reference org login Commands](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_org_commands_unified.htm).

`sf org login web --instance-url=<Org URL>`

When prompted, enter your username and password, and connect. The command-line interface shows the message "Authentication Successful"

For example:
`username@userdomain ~ % sf org login web --instance-url=https://usa794org-5b.my.salesforce.com`

You then see the authorization message.
Successfully authorized username@salesforce.com with org ID 00DHp000004ArLWMA0

You can also authenticate using a consumer key (client ID) and secret key through connected apps. See [Authorization Through Connected Apps and OAuth 2.0](<[text](https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_oauth_and_connected_apps.htm)>).

3. In a new terminal session, Install the Omnistudio Migration Assistant by running the `sf plugins install` command. For example

```
sf plugins install @salesforce/plugin-omnistudio-migration-tool@2.0.0-beta.13
```

4. Run the Omnistudio Migration Assistant from the Salesforce CLI:

```
// To assess everything without migrating
sfdx omnistudio:migration:assess -u YOUR_ORG_USERNAME@DOMAIN.COM

// To migrate everything
sfdx omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM


// To migrate/assess specific components: FlexCards, DataMappers, Integration Procedures, OmniScripts, or Global Auto Numbers, add the following parameters:
--only=dr    // DataMappers (DataRaptors)
--only=ip    // Integration Procedures
--only=os    // OmniScripts
--only=fc    // FlexCards
--only=autonumber   // Global Auto Numbers

// To migrate all versions of the components and not just the active ones:
--allversions

// To assess specific related objects:
--relatedobjects=apex    // for Apex classes only

// To specify the Velocity Namespace (Optional)
--namespace=VLOCITY_PACKAGE_NAMESPACE
```

5. An HTML page will be open in your default browser with the results of your migration/assessment reports.

## Global Auto Number Migration

Global Auto Numbers are components that generate sequential numbers across your Omnistudio org. The migration tool supports both assessment and migration of these components.

### Prerequisites for Global Auto Number Migration

Before migrating Global Auto Numbers, ensure that:

1. **Org Preference is Disabled**: The `OmniGlobalAutoNumberPref` org preference must be disabled before migration
2. **Rollback Flags are Disabled**: Both `RollbackIPChanges` and `RollbackDRChanges` flags must be disabled
3. **Namespace is Specified**: Provide the correct namespace for your OmniStudio package

### Global Auto Number Migration Process

The migration process for Global Auto Numbers includes:

1. **Pre-migration Checks**: Validates that org preferences and rollback flags are properly configured
2. **Data Migration**: Transforms Global Auto Number settings from custom objects to standard Business Process Objects (BPO)
3. **Post-migration Cleanup**: Removes source objects and enables the `OmniGlobalAutoNumberPref` org preference
4. **Validation**: Ensures all records are successfully migrated before cleanup

### Global Auto Number Assessment

Assessment provides detailed information about:

- **Name Changes**: Identifies any naming modifications required to comply with API naming standards
- **Migration Readiness**: Determines if components can be automatically migrated or require manual intervention
- **Warnings**: Highlights potential issues that may affect migration success

### Usage Examples for Global Auto Numbers

```bash
# Assess Global Auto Numbers only
sfdx omnistudio:migration:assess -u YOUR_ORG_USERNAME@DOMAIN.COM --only=autonumber

# Migrate Global Auto Numbers only
sfdx omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM --only=autonumber
```

5. An HTML page will be open in your default browser with the results of your migration/assessment job.

### Assess Usage & parameters

```
USAGE
  $ sf omnistudio:migration:assess [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel
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

  -a, --allversions                                                                 migrate all versions and not
                                                                                    and not just the active ones.

  --only=only                                                                       specify components to assess:
                                                                                    dr (DataRaptors), ip (Integration Procedures),
                                                                                    os (OmniScripts), fc (FlexCards), autonumber (Global Auto Numbers)

  --relatedobjects=relatedobjects                                                   specify related objects to assess:
                                                                                    'apex' for Apex classes
```

### Migrate Usage & parameters

```
USAGE
  $ sf omnistudio:migration:migrate [-n <string>] [-f] [-v <string>] [-u <string>] [--apiversion <string>] [--json] [--loglevel
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

  -a, --allversions                                                                 migrate all versions and not
                                                                                    and not just the active ones.

  --only=only                                                                       specify components to migrate:
                                                                                    dr (DataRaptors), ip (Integration Procedures),
                                                                                    os (OmniScripts), fc (FlexCards)

  --relatedobjects=relatedobjects                                                   specify related objects to assess:
                                                                                    'apex' for Apex classes
```

> **Note:** LWC (Lightning Web Components) assessment/migration functionality is temporarily disabled in the current version. LWC features will be re-enabled in a future releases.

> Apex migration functionality remains fully available. The `--relatedobjects` flag only accepts values ('apex')

Terms:
Notwithstanding anything stated in the terms and conditions agreed between Salesforce (‘SFDC’) and you (‘Customer’), the use of the OmniStudio Migration Assistant (‘Assistant’) is designed to facilitate the migration and it’s going to modify your custom code and by deploying and using the Assistant you hereby provide your consent to automate the migration process and enable a smooth transition. Customer shall access and use the Assistant only as permitted to the Customer and shall not compromise, break or circumvent any technical processes or security measures associated with the services provided by SFDC.
The Customer agrees to hold harmless, indemnify, and defend SFDC, and its officers, directors, agents, employees, licensees, successors and assigns (collectively, the “Indemnified Parties”) against any and all damages, penalties, losses, liabilities, judgments, settlements, awards, costs, and expenses (including reasonable attorneys’ fees and expenses) to the extent arising out of or in connection with any claims related to the Customers use of the Assistant or any willful misconduct, fraud or grossly negligent acts or omissions by the Customer.
