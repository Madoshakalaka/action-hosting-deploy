/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  endGroup,
  getInput,
  setFailed,
  setOutput,
  startGroup,
} from "@actions/core";
import { context, getOctokit } from "@actions/github";
import { existsSync } from "fs";
import { createCheck } from "./createCheck";
import { createGacFile } from "./createGACFile";
import {
  deploy,
  deployProductionSite,
  DeployAuth,
  ErrorResult,
  interpretChannelDeployResult,
} from "./deploy";
import { getChannelId } from "./getChannelId";
import {
  getURLsMarkdownFromChannelDeployResult,
  postChannelSuccessComment,
} from "./postOrUpdateComment";

const googleApplicationCredentials = getInput("firebaseServiceAccount");
const firebaseToken = getInput("firebaseToken");

const expires = getInput("expires");
const commentURLPath = getInput("commentURLPath");

const projectId = getInput("projectId");
const configuredChannelId = getInput("channelId");
const isProductionDeploy = configuredChannelId === "live";
const targets = getInput("targets")
  .split(",")
  .map((target) => target.trim());

const token = process.env.GITHUB_TOKEN || getInput("repoToken");
const octokit = token ? getOctokit(token) : undefined;
const entryPoint = getInput("entryPoint");
const firebaseToolsVersion = getInput("firebaseToolsVersion");
const disableComment = getInput("disableComment");
const force = getInput("force") === "true";

export interface PRContext {
  prNumber: number;
  commitSHA: string;
  branchName: string;
}

function getPRContext(): PRContext | null {
  const payload = context.payload.pull_request;

  let prNumber: number;
  let rawPrNumber = getInput("prNumber");
  if (rawPrNumber) {
    prNumber = parseInt(rawPrNumber, 10);
  } else if (payload) {
    prNumber = payload.number;
  } else {
    return null;
  }

  const commitSHA: string | null = getInput("commitSHA") || payload?.head.sha;
  if (!commitSHA) {
    return null;
  }

  const branchName: string | null =
    getInput("prBranchName") || payload?.head.ref;
  if (!branchName) {
    return null;
  }

  return {
    prNumber,
    commitSHA,
    branchName,
  };
}

async function run() {
  const prContext = getPRContext();

  let finish = (details: Object) => console.log(details);
  if (token && prContext) {
    finish = await createCheck(octokit, context, prContext.commitSHA);
  }

  try {
    startGroup("Verifying firebase.json exists");

    if (entryPoint !== ".") {
      console.log(`Changing to directory: ${entryPoint}`);
      try {
        process.chdir(entryPoint);
      } catch (err) {
        throw Error(`Error changing to directory ${entryPoint}: ${err}`);
      }
    }

    if (existsSync("./firebase.json")) {
      console.log("firebase.json file found. Continuing deploy.");
    } else {
      throw Error(
        "firebase.json file not found. If your firebase.json file is not in the root of your repo, edit the entryPoint option of this GitHub action."
      );
    }
    endGroup();

    startGroup("Setting up CLI credentials");
    const auth: DeployAuth = {};
    if (googleApplicationCredentials && firebaseToken) {
      throw Error(
        "can only specify either 'firebaseServiceAccount' or 'firebaseToken', not both!"
      );
    } else if (googleApplicationCredentials) {
      auth.gacFilename = await createGacFile(googleApplicationCredentials);
      console.log(
        "Created a temporary file with Application Default Credentials."
      );
    } else if (firebaseToken) {
      auth.firebaseToken = firebaseToken;
      console.log("authenticating with token.");
    } else {
      throw Error(
        "must specify either 'firebaseServiceAccount' or 'firebaseToken'"
      );
    }
    endGroup();

    if (isProductionDeploy) {
      startGroup("Deploying to production site");
      const deployment = await deployProductionSite(auth, {
        projectId,
        targets,
        firebaseToolsVersion,
        force,
      });
      if (deployment.status === "error") {
        throw Error((deployment as ErrorResult).error);
      }
      endGroup();

      const url = `https://${projectId}.web.app/`;
      await finish({
        details_url: url,
        conclusion: "success",
        output: {
          title: `Production deploy succeeded`,
          summary: `[${projectId}.web.app](${url})`,
        },
      });
      return;
    }

    const channelId = getChannelId(configuredChannelId, context, prContext);

    startGroup(`Deploying to Firebase preview channel ${channelId}`);
    const deployment = await deploy(auth, {
      projectId,
      expires,
      channelId,
      targets,
      firebaseToolsVersion,
      force,
    });

    if (deployment.status === "error") {
      throw Error((deployment as ErrorResult).error);
    }
    endGroup();

    const { expireTime, expire_time_formatted, urls } =
      interpretChannelDeployResult(deployment);

    setOutput("urls", urls);
    setOutput("expire_time", expireTime);
    setOutput("expire_time_formatted", expire_time_formatted);
    setOutput("details_url", urls[0]);

    if (disableComment === "true") {
      console.log(
        `Commenting on PR is disabled with "disableComment: ${disableComment}"`
      );
    } else if (token && prContext && !!octokit) {
      const commitId = prContext.commitSHA.substring(0, 7);

      await postChannelSuccessComment(
        octokit,
        context,
        prContext.prNumber,
        deployment,
        commitId,
        commentURLPath
      );
    }

    await finish({
      details_url: urls[0],
      conclusion: "success",
      output: {
        title: `Deploy preview succeeded`,
        summary: getURLsMarkdownFromChannelDeployResult(
          deployment,
          commentURLPath
        ),
      },
    });
  } catch (e) {
    setFailed(e.message);

    await finish({
      conclusion: "failure",
      output: {
        title: "Deploy preview failed",
        summary: `Error: ${e.message}`,
      },
    });
  }
}

run();
