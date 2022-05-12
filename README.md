OmniStudio Migration Tool
=========================

This repository contains the code required to enable the OmniStudio Migration Tool SFDX plugin.

## Running SFDX plugin in developer mode

1. Install SFDX cli using the official documentation located [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm).
2. Authenticate your SFDX cli into the org you are going to use for development. You can follow authentication steps [here](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_auth_web.htm).
3. Clone this repository into your local machine.
4. Open the migration tool code folder in VSCode or your prefered editor.
5. In a new command line tool, run the following command: 
```
bin/run omnistudio:migration:migrate -u agarcia-vertical238@na46.salesforce.com --namespace=agarciana46_238 --json
```

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

### Folder structure
```
- 
  - .vscode                                             VSCode configuration folder
  - bin                                                 Tools required to run in developer mode
  - messages                                            JSON files with user messages used in the plugin
  - src
    - commands                                          SFDX plugin commands
    - mappings                                          A list of mappings between vertical and standard objects
    - migration                                         OmniStudio Migration Tool code
    - utils                                             Utilities (network, debugging, logging, etc.)
```



_See code: [src/commands/hello/org.ts](https://github.com/agarcia-sf/omnistudio-migration-tool/blob/v0.0.0/src/commands/hello/org.ts)_
<!-- commandsstop -->
<!-- debugging-your-plugin -->
# Debugging your plugin
We recommend using the Visual Studio Code (VS Code) IDE for your plugin development. Included in the `.vscode` directory of this plugin is a `launch.json` config file, which allows you to attach a debugger to the node process when running your commands.

To debug the `hello:org` command: 
1. Start the inspector
  
If you linked your plugin to the sfdx cli, call your command with the `dev-suspend` switch: 
```sh-session
$ sfdx hello:org -u myOrg@example.com --dev-suspend
```
  
Alternatively, to call your command using the `bin/run` script, set the `NODE_OPTIONS` environment variable to `--inspect-brk` when starting the debugger:
```sh-session
$ NODE_OPTIONS=--inspect-brk bin/run hello:org -u myOrg@example.com
```

2. Set some breakpoints in your command code
3. Click on the Debug icon in the Activity Bar on the side of VS Code to open up the Debug view.
4. In the upper left hand corner of VS Code, verify that the "Attach to Remote" launch configuration has been chosen.
5. Hit the green play button to the left of the "Attach to Remote" launch configuration window. The debugger should now be suspended on the first line of the program. 
6. Hit the green play button at the top middle of VS Code (this play button will be to the right of the play button that you clicked in step #5).
<br><img src=".images/vscodeScreenshot.png" width="480" height="278"><br>
Congrats, you are debugging!
