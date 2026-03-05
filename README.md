# Omnistudio Migration Assistant

The Omnistudio Migration Assistant is a Salesforce CLI plugin that automates the migration of Omnistudio components. When run on a custom data model with managed package runtime, it migrates components to the standard data model and switches them to the Omnistudio standard runtime. When run on a standard data model with managed package, it cleans record names, enables the metadata API, and switches to the Omnistudio standard runtime.

## 🚀 Before You Begin

> **Note:** The `sfdx` CLI has been deprecated. Please use `sf` CLI commands instead. The deprecated `sfdx` command aliases (`-u`, `--targetusername`) are still supported.

⚠️ IMPORTANT: Before installing and using the Omnistudio Migration Assistant, contact Salesforce support.

- Review the migration phases in [Migration Process from Omnistudio for Managed Packages to Omnistudio](https://help.salesforce.com/s/articleView?id=xcloud.os_migrate_omnistudio_custom_objects_to_standard_objects.htm&language=en_US&type=5)

- Install Salesforce CLI on your computer. See : [Install Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).

- To deploy LWC as part of auto-deployment process, environment variable 'OMA_AUTH_KEY' should be set with requested NPM repository access key from Salesforce Customer Support.

- This tool requires Node Version 18+.

- LWC migration auto-deployment needs minimum node version of 18.17.1

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
sf plugins install @salesforce/plugin-omnistudio-migration-tool@2.0.0-dev.1
```

4. Run the Omnistudio Migration Assistant from the Salesforce CLI:

```
// To assess everything without migrating
sf omnistudio:migration:assess -u YOUR_ORG_USERNAME@DOMAIN.COM

// To migrate everything
sf omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM


// To migrate/assess specific components: Flexcards, Data Mappers, Integration Procedures, Omniscripts, Omni Global Auto Numbers or Custom Labels, add the following parameters:
--only=dm           // Data Mappers
--only=ip           // Integration Procedures
--only=os           // Omniscripts
--only=fc           // Flexcards
--only=autonumber   // Omni Global Auto Numbers
--only=cl           // Custom Labels

// To migrate all versions of the components and not just the active ones:
--allversions

// To assess specific set of related objects:
--relatedobjects=apex                             // for Apex classes only
--relatedobjects=lwc                              // for Lightning Web Components only
--relatedobjects=expsites                         // for Experience Sites only
--relatedobjects=flexipage                        // for FlexiPages only
--relatedobjects=apex,lwc,expsites,flexipage      // for all related objects

```

5. An HTML page will be open in your default browser with the results of your migration/assessment reports.

## Omni Global Auto Number Migration

Omni Global Auto Numbers are components that generate sequential numbers across your Omnistudio org. The migration tool supports both assessment and migration of these components.

### Prerequisites for Omni Global Auto Number Migration

Before migrating Omni Global Auto Numbers, ensure that:

1. **Org Preference is Disabled**: The `OmniGlobalAutoNumberPref` org preference must be disabled before migration
2. **Rollback Flags are Disabled**: Both `RollbackIPChanges` and `RollbackDRChanges` flags must be disabled
3. **Namespace is Specified**: Provide the correct namespace for your OmniStudio package

### Omni Global Auto Number Migration Process

The migration process for Omni Global Auto Numbers includes:

1. **Pre-migration Checks**: Validates that org preferences and rollback flags are properly configured
2. **Data Migration**: Transforms Omni Global Auto Number settings from custom objects to standard Business Process Objects (BPO)
3. **Post-migration Cleanup**: Removes source objects and enables the `OmniGlobalAutoNumberPref` org preference
4. **Validation**: Ensures all records are successfully migrated before cleanup

### Omni Global Auto Number Assessment

Assessment provides detailed information about:

- **Name Changes**: Identifies any naming modifications required to comply with API naming standards
- **Migration Readiness**: Determines if components can be automatically migrated or require manual intervention
- **Warnings**: Highlights potential issues that may affect migration success

### Usage Examples for Omni Global Auto Numbers

```bash
# Assess Omni Global Auto Numbers only
sf omnistudio:migration:assess -u YOUR_ORG_USERNAME@DOMAIN.COM --only=autonumber

# Migrate Omni Global Auto Numbers only
sf omnistudio:migration:migrate -u YOUR_ORG_USERNAME@DOMAIN.COM --only=autonumber
```

5. An HTML page will be open in your default browser with the results of your migration/assessment job.

## Clean Command

The clean command deactivates and deletes Omnistudio records (Omniscripts, Integration Procedures, Flexcards, and Data Mappers) that prevent enabling the Omnistudio Metadata API. This includes records with special characters in unique name fields or missing unique names.

⚠️ **Warning:** This action is permanent. Run in a testing sandbox and verify results before running in your production environment.

### Prerequisites for Clean Command

Before running the clean command, ensure that:

1. **Standard Data Model**: Your org must be using the standard data model (not custom data model)
2. **Metadata API Not Enabled**: The Omnistudio Metadata API must not already be enabled in your org
3. **Backup Components**: All Omnistudio components should be backed up or deployed to a testing sandbox
4. **Testing Sandbox**: Always run the clean command in a testing sandbox first to verify results
5. **Org Authentication**: You must be authenticated to your Salesforce org using `sf org login web`

### Clean Command Process

The clean command runs in two phases:

1. **Phase 1: Special Character Cleanup**

   - Scans and removes records with special characters in their unique name fields
   - These records are incompatible with the Metadata API

2. **Phase 2: Missing Unique Name Cleanup**
   - Scans and removes records without a deployment reference (missing unique names)
   - These records also prevent enabling the Metadata API

### Clean Command with Assessment (Preview Mode)

Use the `--assess` flag to preview which records would be removed without making any changes to your org. This is the recommended first step before running the actual clean command.

**Features:**

- No changes are made to your org
- Assessment reports are saved to the `clean_assessment` folder in your current directory
- Reports are generated as JSON files for each component type
- Shows both special character records and orphan records (missing unique names)

**Usage:**

```bash
# Preview what would be cleaned (no changes made)
sf omnistudio:migration:clean -u YOUR_ORG_USERNAME@DOMAIN.COM --assess

# With verbose output
sf omnistudio:migration:clean -u YOUR_ORG_USERNAME@DOMAIN.COM --assess --verbose
```

**Assessment Output:**

- Assessment reports are saved in the `clean_assessment` folder
- Each component type (Omniscripts, Integration Procedures, Flexcards, Data Mappers) has its own JSON file
- Each JSON file contains:
  - `component`: Component type name
  - `specialCharacterRecords`: Records with special characters in unique name fields
  - `orphanRecords`: Records without deployment references (missing unique names)
  - `totalToDelete`: Total number of records that would be removed

### Clean Command (Actual Cleanup)

After reviewing the assessment reports, you can run the clean command to permanently remove the incompatible records.

**Important Notes:**

- This action is **permanent** and cannot be undone
- You will be prompted for confirmation before any deletions occur
- The command will deactivate records first, then delete them
- After cleanup, you should be able to enable the Omnistudio Metadata API

**Usage:**

```bash
# Clean incompatible records (requires confirmation)
sf omnistudio:migration:clean -u YOUR_ORG_USERNAME@DOMAIN.COM

# With verbose output
sf omnistudio:migration:clean -u YOUR_ORG_USERNAME@DOMAIN.COM --verbose
```

**What Happens:**

1. The command validates that your org meets prerequisites (standard data model, Metadata API not enabled)
2. You are shown a warning and asked to confirm the deletion
3. Phase 1: Records with special characters are deactivated and deleted
4. Phase 2: Records without unique names are deactivated and deleted
5. Cleanup completion message is displayed

### Clean Command Usage & Parameters

```
USAGE
  $ sf omnistudio:migration:clean -u <username> [--assess] [--verbose]

OPTIONS
  -u, --target-org=<username>                       (required) username or alias for the target org
                                                    (aliases: --targetusername - deprecated)

  --assess                                           preview which records would be removed by the clean command,
                                                    without making any changes. Results are saved to the
                                                    'clean_assessment' folder.

  --verbose                                          enable verbose output
```

### Clean Command Examples

```bash
# Step 1: Preview what would be cleaned (recommended first step)
sf omnistudio:migration:clean -u orguser@domain.com --assess

# Step 2: Review the assessment reports in the clean_assessment folder

# Step 3: Run the actual cleanup (after verifying assessment results)
sf omnistudio:migration:clean -u orguser@domain.com

# With verbose output for detailed information
sf omnistudio:migration:clean -u orguser@domain.com --assess --verbose
sf omnistudio:migration:clean -u orguser@domain.com --verbose
```

### Assess Usage & parameters

```
USAGE
  $ sf omnistudio:migration:assess -u <username> [--only <component>] [--allversions]
    [--relatedobjects <objects>] [--verbose]

OPTIONS
  -u, --target-org=<username>                       (required) username or alias for the target org
                                                    (alias: --targetusername - deprecated)

  -o, --only=<component>                            specify a single component to assess:
                                                    dm (Data Mappers),
                                                    ip (Integration Procedures),
                                                    os (Omniscripts),
                                                    fc (Flexcards),
                                                    autonumber (Omni Global Auto Numbers),
                                                    cl (Custom Labels)

  -a, --allversions                                 assess all versions, not just the active ones

  -r, --relatedobjects=<objects>                    specify one or more related objects to assess (comma separated):
                                                    apex       - Apex classes
                                                    lwc        - Lightning Web Components
                                                    expsites   - Experience Sites
                                                    flexipage  - FlexiPages

  --verbose                                         enable verbose output

  --loglevel=<level>                                (deprecated) use --verbose instead
```

### Migrate Usage & parameters

```
USAGE
  $ sf omnistudio:migration:migrate -u <username> [--only <component>] [--allversions]
    [--relatedobjects <objects>] [--verbose]

OPTIONS
  -u, --target-org=<username>                       (required) username or alias for the target org
                                                    (aliases: --targetusername - deprecated)

  -o, --only=<component>                            specify a single component to migrate:
                                                    dm (Data Mappers),
                                                    ip (Integration Procedures),
                                                    os (Omniscripts),
                                                    fc (Flexcards),
                                                    autonumber (Omni Global Auto Numbers),
                                                    cl (Custom Labels)

  -a, --allversions                                 migrate all versions, not just the active ones

  -r, --relatedobjects=<objects>                    specify one or more related objects to migrate (comma separated):
                                                    apex       - Apex classes
                                                    lwc        - Lightning Web Components
                                                    expsites   - Experience Sites
                                                    flexipage  - FlexiPages

  --verbose                                         enable verbose output

  --loglevel=<level>                                (deprecated) use --verbose instead
```

Terms:
Notwithstanding anything stated in the terms and conditions agreed between Salesforce (‘SFDC’) and you (‘Customer’), the use of the OmniStudio Migration Assistant (‘Assistant’) is designed to facilitate the migration and it’s going to modify your custom code and by deploying and using the Assistant you hereby provide your consent to automate the migration process and enable a smooth transition. Customer shall access and use the Assistant only as permitted to the Customer and shall not compromise, break or circumvent any technical processes or security measures associated with the services provided by SFDC.
The Customer agrees to hold harmless, indemnify, and defend SFDC, and its officers, directors, agents, employees, licensees, successors and assigns (collectively, the “Indemnified Parties”) against any and all damages, penalties, losses, liabilities, judgments, settlements, awards, costs, and expenses (including reasonable attorneys’ fees and expenses) to the extent arising out of or in connection with any claims related to the Customers use of the Assistant or any willful misconduct, fraud or grossly negligent acts or omissions by the Customer.
