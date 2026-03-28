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

import { exec } from "@actions/exec";

export type SiteDeploy = {
  site: string;
  target?: string;
  url: string;
  expireTime: string;
};

export type ErrorResult = {
  status: "error";
  error: string;
};

export type ChannelSuccessResult = {
  status: "success";
  result: { [key: string]: SiteDeploy };
};

export type ProductionSuccessResult = {
  status: "success";
  result: {
    hosting: string | string[];
  };
};

export type DeployAuth = {
  gacFilename?: string;
  firebaseToken?: string;
};

function authToEnv(auth: DeployAuth): { [key: string]: string } {
  const env = {};
  if (auth.gacFilename) {
    env["GOOGLE_APPLICATION_CREDENTIALS"] = auth.gacFilename;
  } else if (auth.firebaseToken) {
    env["FIREBASE_TOKEN"] = auth.firebaseToken;
  }
  return env;
}

type DeployConfig = {
  projectId: string;
  targets: string[];
  firebaseToolsVersion?: string;
  force?: boolean;
};

export type ChannelDeployConfig = DeployConfig & {
  expires: string;
  channelId: string;
};

export type ProductionDeployConfig = DeployConfig;

export function interpretChannelDeployResult(
  deployResult: ChannelSuccessResult
): { expireTime: string; expire_time_formatted: string; urls: string[] } {
  const allSiteResults = Object.values(deployResult.result);

  const expireTime = allSiteResults[0].expireTime;
  const expire_time_formatted = new Date(expireTime).toUTCString();
  const urls = allSiteResults.map((siteResult) => siteResult.url);

  return {
    expireTime,
    expire_time_formatted,
    urls,
  };
}

async function execWithCredentials(
  args: string[],
  projectId: string,
  auth: DeployAuth,
  opts: { debug?: boolean; firebaseToolsVersion?: string; force?: boolean }
) {
  let deployOutputBuf: Buffer[] = [];
  const debug = opts.debug || false;
  const firebaseToolsVersion = opts.firebaseToolsVersion || "latest";
  const force = opts.force;

  try {
    await exec(
      `npx firebase-tools@${firebaseToolsVersion}`,
      [
        ...args,
        ...(projectId ? ["--project", projectId] : []),
        ...(force ? ["--force"] : []),
        debug
          ? "--debug"
          : "--json",
      ],
      {
        listeners: {
          stdout(data: Buffer) {
            deployOutputBuf.push(data);
          },
        },
        env: {
          ...process.env,
          FIREBASE_DEPLOY_AGENT: "action-hosting-deploy",
          ...authToEnv(auth),
        },
      }
    );
  } catch (e) {
    console.log(Buffer.concat(deployOutputBuf).toString("utf-8"));
    console.log(e.message);

    if (!debug) {
      console.log(
        "Retrying deploy with the --debug flag for better error output"
      );
      await execWithCredentials(args, projectId, auth, {
        debug: true,
        firebaseToolsVersion,
        force,
      });
    } else {
      throw e;
    }
  }

  return deployOutputBuf.length
    ? deployOutputBuf[deployOutputBuf.length - 1].toString("utf-8")
    : "";
}

export async function deploy(
  auth: DeployAuth,
  deployConfig: ChannelDeployConfig
) {
  const { projectId, channelId, targets, expires, firebaseToolsVersion, force } =
    deployConfig;

  const deploymentText = await execWithCredentials(
    [
      "hosting:channel:deploy",
      ...(targets.length > 0 ? ["--only", targets.join(",")] : []),
      channelId,
      ...(expires ? ["--expires", expires] : []),
    ],
    projectId,
    auth,
    { firebaseToolsVersion, force }
  );

  const deploymentResult = JSON.parse(deploymentText.trim()) as
    | ChannelSuccessResult
    | ErrorResult;

  return deploymentResult;
}

export async function deployProductionSite(
  auth: DeployAuth,
  productionDeployConfig: ProductionDeployConfig
) {
  const { projectId, targets, firebaseToolsVersion, force } =
    productionDeployConfig;

  let targetArg: string;
  if (targets.length > 0) {
    targetArg = targets.map((target) => `hosting:${target}`).join(",");
  } else {
    targetArg = "hosting";
  }

  const deploymentText = await execWithCredentials(
    ["deploy", "--only", targetArg],
    projectId,
    auth,
    { firebaseToolsVersion, force }
  );

  const deploymentResult = JSON.parse(deploymentText) as
    | ProductionSuccessResult
    | ErrorResult;

  return deploymentResult;
}
