/* eslint-disable @typescript-eslint/no-var-requires */
const { TASK_TEST, TASK_COMPILE } = require('hardhat/builtin-tasks/task-names');
const { HardhatPluginError } = require('hardhat/plugins');
const utils = require('solidity-coverage/utils');
const globby = require('globby');
const combine = require('istanbul-combine-updated');
const CoverageAPI = require('solidity-coverage/api');
const fs = require('fs');
const path = require('path');

// Coverage related tasks, subtasks, and helper functions
// Adapted from https://github.com/sc-forks/solidity-coverage/blob/master/plugins/hardhat.plugin.js
// License: MIT

let measureCoverage = false;
let configureYulOptimizer = false;
let instrumentedSources;

async function taskCompileSolidityGetCompilerInput(_, { config }, runSuper) {
  const solcInput = await runSuper();
  if (measureCoverage) {
    // The source name here is actually the global name in the solc input,
    // but hardhat uses the fully qualified contract names.
    for (const [sourceName, source] of Object.entries(solcInput.sources)) {
      const absolutePath = path.join(config.paths.root, sourceName);
      // Patch in the instrumented source code.
      if (absolutePath in instrumentedSources) {
        source.content = instrumentedSources[absolutePath];
      }
    }
  }
  return solcInput;
}

// Solidity settings are best set here instead of the TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT task.
async function taskCompileSolidityGetCompilationJobForFile(_, __, runSuper) {
  const compilationJob = await runSuper();
  if (measureCoverage && typeof compilationJob === 'object') {
    if (compilationJob.solidityConfig.settings === undefined) {
      compilationJob.solidityConfig.settings = {};
    }

    const { settings } = compilationJob.solidityConfig;
    if (settings.metadata === undefined) {
      settings.metadata = {};
    }
    if (settings.optimizer === undefined) {
      settings.optimizer = {};
    }
    // Unset useLiteralContent due to solc metadata size restriction
    settings.metadata.useLiteralContent = false;
    // Override optimizer settings for all compilers
    settings.optimizer.enabled = false;

    // This is fixes a stack too deep bug in ABIEncoderV2
    // Experimental because not sure this works as expected across versions....
    if (configureYulOptimizer) {
      settings.optimizer.details = {
        yul: true,
        yulDetails: {
          stackAllocation: true,
        },
      };
    }
  }
  return compilationJob;
}

/**
 * Coverage task implementation
 * Modified to run tests in serial by passing one test file at a time to minimize memory usage
 * and optimize execution speed
 * @param  {HardhatUserArgs} args
 * @param  {HardhatEnv} env
 */
async function coverage(args, env) {
  const tempCoverageDir = 'coverage_temp';
  if (fs.existsSync(tempCoverageDir)) {
    fs.rmdirSync(tempCoverageDir, { recursive: true });
  }
  let error;
  let api;
  let config;
  let failedTests = 0;

  instrumentedSources = {};

  measureCoverage = true;

  try {
    config = normalizeConfig(env.config, args);

    api = new CoverageAPI(utils.loadSolcoverJS(config));
    // Catch interrupt signals

    // Merge non-null flags into hardhatArguments
    const flags = {};
    for (const key of Object.keys(args)) {
      if (args[key] && args[key].length) {
        flags[key] = args[key];
      }
    }
    env.hardhatArguments = Object.assign(env.hardhatArguments, flags);

    // ================
    // Instrumentation
    // ================

    const skipFiles = api.skipFiles || [];

    let targets = null;
    let skipped = null;

    ({ targets, skipped } = utils.assembleFiles(config, skipFiles));

    targets = api.instrument(targets);
    for (const target of targets) {
      instrumentedSources[target.canonicalPath] = target.source;
    }
    utils.reportSkipped(config, skipped);

    // ==============
    // Compilation
    // ==============

    config.temp = args.temp;
    configureYulOptimizer = false;

    // With Hardhat >= 2.0.4, everything should automatically recompile
    // after solidity-coverage corrupts the artifacts.
    // Prior to that version, we (try to) save artifacts to a temp folder.
    if (!config.useHardhatDefaultPaths) {
      const { tempArtifactsDir, tempContractsDir } = utils.getTempLocations(config);

      utils.setupTempFolders(config, tempContractsDir, tempArtifactsDir);
      config.paths.artifacts = tempArtifactsDir;
      config.paths.cache = './.coverage_cache';
    }

    await env.run(TASK_COMPILE);

    await api.onCompileComplete(config);

    // ==============
    // Server launch
    // ==============
    const network = setupHardhatNetwork(env, api);

    const accounts = await utils.getAccountsHardhat(network.provider);

    api.attachToHardhatVM(network.provider);

    // Set default account (if not already configured)
    if (!network.config.from) {
      network.config.from = accounts[0];
    }

    // Run post-launch server hook;
    await api.onServerReady(config);

    // ======
    // Tests
    // ======
    const testfiles = args.testfiles ? getTestFilePaths(args.testfiles) : getTestFilePaths('test/*');
    const dirNames = [];
    for (let i = 0; i < testfiles.length; i += 1) {
      const fileName = testfiles[i].split('/')[1].split('.')[0].replace(/-/g, '_');
      dirNames.push(fileName);
      try {
        failedTests += await env.run(TASK_TEST, { testFiles: [testfiles[i]] });
      } catch (e) {
        error = e;
      }

      // ========
      // Istanbul
      // ========
      toggleConsole(); // disable console for coverage report of single file
      await api.report(`coverage_temp/${fileName}`);
      toggleConsole(); // re-enable console
      if (!args.mocks) {
        removeMocksFromCoverage(`coverage_temp/${fileName}/coverage-final.json`);
      }
    }

    await api.onTestsComplete(config);
    await api.onIstanbulComplete(config);

    // combine individual reports
    const opts = {
      dir: 'coverage', // output directory for combined report(s)
      pattern: 'coverage_temp/*/coverage-final.json', // json reports to be combined
      print: 'summary', // print to the console (summary, detail, both, none)
      // base: 'sources', // base directory for resolving absolute paths, see karma bug
      reporters: {
        html: {
          /* html reporter options */
        },
      },
    };
    combine.sync(opts);

    fs.rmdirSync(tempCoverageDir, { recursive: true });
  } catch (e) {
    error = e;
  } finally {
    measureCoverage = false;
  }

  await utils.finish(config, api);

  if (error !== undefined) throw new HardhatPluginError(error);
  if (failedTests > 0) {
    console.log('failed tests:', failedTests);
  }
}
/**
 * Normalizes Buidler/Hardhat paths / logging for use by the plugin utilities and
 * attaches them to the config
 * @param  {Buidler/HardhatConfig} config
 * @return {Buidler/HardhatConfig}        updated config
 */
function normalizeConfig(config, args = {}) {
  config.workingDir = config.paths.root;
  config.contractsDir = config.paths.sources;
  config.testDir = config.paths.tests;
  config.artifactsDir = config.paths.artifacts;
  config.logger = config.logger ? config.logger : { log: null };
  config.solcoverjs = args.solcoverjs;
  config.gasReporter = { enabled: false };
  config.useHardhatDefaultPaths = true;

  return config;
}
function setupHardhatNetwork(env, api) {
  const { createProvider } = require('hardhat/internal/core/providers/construction');
  const { HARDHAT_NETWORK_NAME } = require('hardhat/plugins');

  const networkName = HARDHAT_NETWORK_NAME;

  const isHardhatEVM = true;

  const networkConfig = env.network.config;
  configureHardhatEVMGas(networkConfig, api);

  const provider = createProvider(networkName, networkConfig, env.config.paths, env.artifacts);

  return configureNetworkEnv(env, networkName, networkConfig, provider, isHardhatEVM);
}

function configureNetworkEnv(env, networkName, networkConfig, provider, isHardhatEVM) {
  env.config.networks[networkName] = networkConfig;
  env.config.defaultNetwork = networkName;

  env.network = Object.assign(env.network, {
    name: networkName,
    config: networkConfig,
    provider: provider,
    isHardhatEVM: isHardhatEVM,
  });

  env.ethereum = provider;

  // Return a reference so we can set the from account
  return env.network;
}

function configureHardhatEVMGas(networkConfig, api) {
  networkConfig.allowUnlimitedContractSize = true;
  networkConfig.blockGasLimit = api.gasLimitNumber;
  networkConfig.gas = api.gasLimit;
  networkConfig.gasPrice = api.gasPrice;
  networkConfig.initialBaseFeePerGas = 0;
}

/**
 * Returns a list of test files to pass to mocha.
 * @param  {String}   files   file or glob
 * @return {String[]}         list of files to pass to mocha
 */
function getTestFilePaths(files) {
  const target = globby.sync([files]);

  // Buidler/Hardhat supports js & ts
  const testregex = /.*\.(js|ts)$/;
  return target.filter((f) => f.match(testregex) != null);
}

let oldConsole = null;
function toggleConsole() {
  if (oldConsole === null) {
    oldConsole = console.log;
    console.log = function () {
      return;
    };
  } else {
    console.log = oldConsole;
    oldConsole = null;
  }
}

function removeMocksFromCoverage(fileName) {
  var m = JSON.parse(fs.readFileSync(fileName).toString());
  for (const key of Object.keys(m)) {
    if (key.match(/mock/i)) {
      delete m[key];
    }
  }
  fs.writeFileSync(fileName, JSON.stringify(m));
}

module.exports = {
  taskCompileSolidityGetCompilerInput,
  taskCompileSolidityGetCompilationJobForFile,
  coverage,
  getTestFilePaths,
};
