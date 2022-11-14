require('@nomiclabs/hardhat-waffle');
require('@openzeppelin/hardhat-upgrades');
require('@nomiclabs/hardhat-etherscan');
/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const { types, subtask } = require('hardhat/config');
const {
  TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT,
  TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE,
} = require('hardhat/builtin-tasks/task-names');
const {
  coverage,
  taskCompileSolidityGetCompilationJobForFile,
  taskCompileSolidityGetCompilerInput,
} = require('./coverage');
const { testSerial } = require('./test-serial');

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

subtask(TASK_COMPILE_SOLIDITY_GET_COMPILER_INPUT).setAction(taskCompileSolidityGetCompilerInput);
subtask(TASK_COMPILE_SOLIDITY_GET_COMPILATION_JOB_FOR_FILE).setAction(taskCompileSolidityGetCompilationJobForFile);
task('coveragecustom', 'Generates a code coverage report for tests')
  .addOptionalParam('testfiles', 'Test files to run', '', types.string)
  .addOptionalParam('solcoverjs', 'Solcover config file', '', types.string)
  .addOptionalParam('temp', 'Temp directory', '', types.string)
  .addOptionalParam('mocks', 'Include mock file paths in coverage data', false, types.boolean)
  .setAction(coverage);

task(
  'testserial',
  'Run tests in serial order. Workaround for the proper-lockfile intermittent failure during parallel testing',
)
  .addOptionalParam('testfiles', 'Test files to run', '', types.string)
  .setAction(testSerial);

// Hardhat configuration

const solidityConfig = {
  version: '0.6.12',
  settings: {
    optimizer: {
      enabled: true,
      runs: 490,
      details: {
        yul: false, // https://github.com/ethereum/solidity/issues/11638
      },
    },
  },
};

if (process.env.HARDHAT_NETWORK) {
  // only process the full config if HARDHAT_NETWORK is defined (i.e., if we want to deploy)
  require('hardhat-multibaas-plugin');

  // Retrieve and process the config file
  const CONFIG_FILE = path.join(__dirname, `./deployment-config.${process.env.HARDHAT_NETWORK || 'development'}`);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require(CONFIG_FILE);

  // You need to export an object to set up your config
  // Go to https://hardhat.org/config/ to learn more

  /**
   * @type import('hardhat/config').HardhatUserConfig
   */
  module.exports = {
    networks: {
      development: {
        url: `${config.deploymentEndpoint}/web3/${config.apiKey}`,
        chainId: config.ethChainID,
        accounts: [config.deployerPrivateKey],
      },
      testing: {
        // shared development MultiBaas deployment on the Curvegrid Test Network
        url: config.web3Endpoint,
        chainId: config.ethChainID,
        accounts: [config.deployerPrivateKey],
        gasPrice: 2000000000,
      },
      staging: {
        // shared integration MultiBaas deployment on a public test network
        url: config.web3Endpoint,
        chainId: config.ethChainID,
        accounts: [config.deployerPrivateKey],
      },
      production: {
        // production MultiBaas deployment
        url: config.web3Endpoint,
        chainId: config.ethChainID,
        accounts: [config.deployerPrivateKey],
        gasPrice: 5000000000,
      },
    },
    mbConfig: {
      apiKey: config.apiKey,
      host: config.deploymentEndpoint,
      allowUpdateAddress: ['development', 'testing', 'staging'],
      allowUpdateContract: ['development', 'testing', 'staging'],
    },
    etherscan: {
      // Your API key for Bscscan
      // Obtain one at https://bscscan.com/
      apiKey: config.bscscanApiKey,
    },
    solidity: solidityConfig,
  };
} else {
  // HRE (Hardhat Runtime Environment, i.e., we're likely testing and not deploying)
  require('solidity-coverage');
  module.exports = {
    networks: {
      hardhat: {
        ...(process.env.COVERAGE && {
          allowUnlimitedContractSize: true,
        }),
      },
    },
    solidity: solidityConfig,
    mocha: {
      timeout: 40000,
    },
  };
}
