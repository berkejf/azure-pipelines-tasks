import tl = require("vsts-task-lib/task");
import path = require("path");
import { Action } from "./operations/Action";
import { Utility, ActionType, Delimiters} from "./operations/Utility";
import { Inputs} from "./operations/Constants";
import { ChangeLog } from "./operations/ChangeLog";
import { Helper } from "./operations/Helper";

class Main {

    public static async run(): Promise<void> {
        try {
            var taskManifestPath = path.join(__dirname, "task.json");
            tl.debug("Setting resource path to " + taskManifestPath);
            tl.setResourcePath(taskManifestPath);    

            let actions = new Action();
            let helper = new Helper()

            helper.publishTelemetry();

            // Get basic task inputs
            const githubEndpoint = tl.getInput(Inputs.gitHubConnection, true);
            const githubEndpointToken = Utility.getGithubEndPointToken(githubEndpoint);
            const repositoryName = tl.getInput(Inputs.repositoryName, true);        
            const action = tl.getInput(Inputs.action, true).toLowerCase();
            let tag = tl.getInput(Inputs.tag);

            if (action === ActionType.delete) {
                await actions.deleteReleaseAction(githubEndpointToken, repositoryName, tag);
            }
            else {
                // Get task inputs specific to create and edit release
                const target = tl.getInput(Inputs.target, true);
                const releaseTitle = tl.getInput(Inputs.title) || undefined;

                const isPrerelease = tl.getBoolInput(Inputs.isPreRelease) || false;
                const isDraft = tl.getBoolInput(Inputs.isDraft) || false;
                const githubReleaseAssetInputPatterns = tl.getDelimitedInput(Inputs.assets, Delimiters.newLine);

                if (action === ActionType.create) {
                    // Get tag to create release
                    tag = await helper.getTagForCreateAction(githubEndpointToken, repositoryName, target, tag);

                    if (!!tag) {
                        const releaseNote: string = await this._getReleaseNote(githubEndpointToken, repositoryName, target);
                        await actions.createReleaseAction(githubEndpointToken, repositoryName, target, tag, releaseTitle, releaseNote, isDraft, isPrerelease, githubReleaseAssetInputPatterns);
                    }
                    else {
                        // If no tag found, then give warning.
                        // Doing this because commits without associated tag will fail continuosly if we throw error.
                        // Other option is to have some task condition, which user can specify in task.
                        tl.warning(tl.loc("NoTagFound"));
                        tl.debug("No tag found"); // for purpose of L0 test only.
                    }
                }
                else if (action === ActionType.edit) {
                    const releaseNote: string = await this._getReleaseNote(githubEndpointToken, repositoryName, target);
                    // Get the release id of the release to edit.
                    console.log(tl.loc("FetchReleaseForTag", tag));
                    let releaseId: any = await helper.getReleaseIdForTag(githubEndpointToken, repositoryName, tag);

                    // If a release is found, then edit it.
                    // Else create a new release.
                    if (!!releaseId) {
                        console.log(tl.loc("FetchReleaseForTagSuccess", tag));
                        await actions.editReleaseAction(githubEndpointToken, repositoryName, target, tag, releaseTitle, releaseNote, isDraft, isPrerelease, githubReleaseAssetInputPatterns, releaseId);
                    }
                    else {
                        tl.warning(tl.loc("NoReleaseFoundToEditCreateRelease", tag));
                        await actions.createReleaseAction(githubEndpointToken, repositoryName, target, tag, releaseTitle, releaseNote, isDraft, isPrerelease, githubReleaseAssetInputPatterns);
                    }
                }
                else {
                    tl.debug("Invalid action input"); // for purpose of L0 test only.
                    throw new Error(tl.loc("InvalidActionSet", action));
                }
            }

            tl.setResult(tl.TaskResult.Succeeded, "");
        }
        catch(error) {
            tl.setResult(tl.TaskResult.Failed, error);
        }
    }

    private static async _getReleaseNote(githubEndpointToken: string, repositoryName: string, target: string): Promise<string> {
        const releaseNotesSelection = tl.getInput(Inputs.releaseNotesSource);
        const releaseNotesFile = tl.getPathInput(Inputs.releaseNotesFile, false, true);
        const releaseNoteInput = tl.getInput(Inputs.releaseNotes);
        const showChangeLog: boolean = tl.getBoolInput(Inputs.addChangeLog);

        // Generate the change log 
        // Get change log for top 250 commits only
        const changeLog: string = showChangeLog ? await new ChangeLog().getChangeLog(githubEndpointToken, repositoryName, target, 250) : "";

        // Append change log to release note
        const releaseNote: string = Utility.getReleaseNote(releaseNotesSelection, releaseNotesFile, releaseNoteInput, changeLog) || undefined;

        return releaseNote;
    }
}

Main.run();
