/* eslint-disable @typescript-eslint/no-var-requires */
const { expect } = require('chai');
const { utils, BigNumber } = require('ethers');
const { convertRateToScaledPerSecondRate } = require('../test/utils/management-fee.js');
const { filterEventsByABI } = require('../test/utils/fndz-utilities.js');
const { verifyContract } = require('./utils/verifyContract');
/* eslint-enable @typescript-eslint/no-var-requires */

// Event ABI
const comptrollerProxyDeployedEventABI =
  'event ComptrollerProxyDeployed(address indexed creator,address comptrollerProxy,address indexed denominationAsset,uint256 sharesActionTimelock,bytes feeManagerConfigData,bytes policyManagerConfigData,bool indexed forMigration)';

// FNDZ Contract owner address to transfer the ownership of the contracts after migration
const FNDZ_OWNER = '0x52f1DCdd06941a426B78ACA777f4D83d9e88159b';
const ropstenDependencies = {
  // vault's proxy addresses to migrate
  vaults: [
    {
      address: '0x0feDdcc5AA30042D60A87fF188e0Fb240c5E3B11',
      comptrollerLabel: 'comptroller_lib_migrate_one_23248587842',
    },
    {
      address: '0xEc368BD90c4C6ad3311C5b62C56E77B2bDaf30F4',
      comptrollerLabel: 'comptroller_lib_migrate_two_6587649775507241',
    },
  ],

  // Migration Timelock
  migrationTimelock: 0,

  // Shares Action Timelock for vault
  sharesActionTimelock: 0,

  // FNDZ Token Address
  fndzToken: '0x366a0AE266af935d3f3C0570e61baC3E61088232',

  // Denomination Asset Address
  denominationAsset: '0x2f72afd6713AED3d52CE28B1f8eB673520CB8B0F',

  // VaultLib contract address
  vaultLib: '0xEac787AA0FB96fc7E78A1c9dfb8e5e06cE5D1542',

  // FNDZController contract address
  fndzController: '0xC6FF228E0225B6ffAe536422f0A2CEf3E11A320D',

  // Dispatcher contract address
  dispatcher: '0xc36Ec4554275F12Fed9Fb1Eb203857288048787e',

  // ValueInterpreter contract address
  valueInterpreter: '0x76ef12E0204fd28bE9a5c6FBcF885E95d475E7B4',

  // FeeManager contract address
  feeManager: '0xda0A19D1F0ec4E38E1cC493C0DD69dA8D1F7f238',

  // IntegrationManager contract address
  integrationManager: '0x9C43e0F8581a9C63eF3d121474d00BD1c4495dDF',

  // PolicyManager contract address
  policyManager: '0x48F4747635eD3f4d0C6ED5Cd295041d29B7B76c7',

  // ChainlinkPriceFeed contract address
  chainlinkPriceFeed: '0xa52E295210D187477Ef6D36C0484D40A802AA296',

  // ManagementFee contract address
  managementFee: '0xC379D9Cf7E8496fcafdD0a1CA16545Ba6081DA2c',
  // ManagementFee percentage
  managementFeePercentage: utils.parseEther('0.03'),

  // PerformanceFee contract address
  performanceFee: '0x3d3934cFE8A1187DFEDA09e5f3a73Ee04cB0e257',
  // PerformanceFee configs
  performanceFeePercentage: utils.parseEther('0.05'),
  crystallizationPeriod: BigNumber.from('604800'), // Weekly in seconds

  // MinMaxInvestment contract address
  minMaxInvestment: '0x1377A121b190519E4cDd122caC800225d4D96EA5',
  // MinMaxInvestment Policy Limit
  minInvestmentAmount: hre.ethers.utils.parseEther('50'),
  maxInvestmentAmount: hre.ethers.utils.parseEther('0'),
};

const binanceDependencies = {
  // vault's proxy addresses to migrate
  vaults: [
    // BTC Heavy Index Vault
    {
      address: '0x8eDd175bc2a68Dd5d2cc7541FeBC2502Bf0d36DE',
      comptrollerLabel: 'comptroller_lib_btc_heavy_index',
    },
    // BTC Mid Index Vault
    {
      address: '0x9da3310131134D7099691b75dF3374C228d9f306',
      comptrollerLabel: 'comptroller_lib_btc_mid_index',
    },
    // BTC Light Index Vault
    {
      address: '0xE4a5046c49655f63b5f280a8bE6Ea6027d5a7741',
      comptrollerLabel: 'comptroller_lib_btc_light_index',
    },
    // ETH Heavy Index Vault,
    {
      address: '0x1C3b20e82fB018aB7A2F8Ca68947898DfA36Ef30',
      comptrollerLabel: 'comptroller_lib_eth_heavy_index',
    },
    // ETH Mid Index Vault
    {
      address: '0xd82b25Fd36Bd80739E862EB92377772a7c685fE3',
      comptrollerLabel: 'comptroller_lib_eth_mid_index',
    },
    // ETH Light Index Vault
    {
      address: '0xb597B41108C3eBDc04c8c39443616766Dc210bA4',
      comptrollerLabel: 'comptroller_lib_eth_light_index',
    },
  ],

  // Migration Timelock
  migrationTimelock: 0,

  // Shares Action Timelock for vault
  sharesActionTimelock: 0,

  // FNDZ Token Address
  fndzToken: '0x7754c0584372D29510C019136220f91e25a8f706',

  // Denomination Asset Address
  denominationAsset: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',

  // VaultLib contract address
  vaultLib: '0x5B3E7C370128B5774F0619325C4f7CB222A41ab5',

  // FNDZController contract address
  fndzController: '0x0DcfB08d2953f1B4912dDaE4909E3423948508B2',

  // Dispatcher contract address
  dispatcher: '0x07036f5385AE6F4049f7788bD960f9Dd7fecC241',

  // ValueInterpreter contract address
  valueInterpreter: '0x7461730a7E8dA97f11351cE56B354a6FfcF10b18',

  // FeeManager contract address
  feeManager: '0x551b057cd0276ea8AA4C1b44cf1b268b6EFbCf12',

  // IntegrationManager contract address
  integrationManager: '0xf05e221a1F5E0F5541c7Fd4180D8f4686A918b31',

  // PolicyManager contract address
  policyManager: '0xfdE497859Be86292F1292d743446F03c99DBEb5B',

  // ChainlinkPriceFeed contract address
  chainlinkPriceFeed: '0x305BDf9D67Acf27BB391b4eAe7aFBB0389cb1Cc3',

  // ManagementFee contract address
  managementFee: '0x71f5bc38B94Eff1926fE7bbf2F7B506903c1e074',
  // ManagementFee percentage
  managementFeePercentage: utils.parseEther('0.03'),

  // PerformanceFee contract address
  performanceFee: '0xc3B287A1B16B25890a915a0753ba5f640bB74Fc9',
  // PerformanceFee configs
  performanceFeePercentage: utils.parseEther('0.05'),
  crystallizationPeriod: BigNumber.from('604800'), // Weekly in seconds

  // MinMaxInvestment contract address
  minMaxInvestment: '0x46bbf3Ff4D5a2B39C4bb829dAE744992D359Cf6A',
  // MinMaxInvestment Policy Limit
  minInvestmentAmount: hre.ethers.utils.parseEther('50'),
  maxInvestmentAmount: hre.ethers.utils.parseEther('0'),
};

let doSleep = false;
const sleepTime = 3000;

function sleep(ms) {
  console.log(`\nSleeping for ${ms}ms...\n`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const accounts = await hre.ethers.getSigners();
  const migrator = accounts[0];
  const abiCoder = new utils.AbiCoder();

  // Choosing contract environment based on chainId
  let dependencies = null;
  const networkID = await hre.network.provider.send('eth_chainId', []);
  if (networkID == '0x3') {
    dependencies = ropstenDependencies;
    doSleep = true; // sleep between transactions when deploying on ropsten
  } else {
    dependencies = binanceDependencies;
    doSleep = true;
  }

  // Validating whether the migrator address have the permission to migration vault or not
  for (const vault of dependencies.vaults) {
    const VaultLib = await hre.ethers.getContractFactory('VaultLib');
    const vaultProxy = VaultLib.attach(vault.address);
    expect(await vaultProxy.canMigrate(migrator.address)).to.eq(true);
  }

  // Creating FNDZController Contract Instance
  const fndzController = await hre.ethers.getContractAt('FNDZController', dependencies.fndzController);

  // Deploying New FundDeployer
  const newFundDeployer = await hre.mbDeployer.deploy(
    migrator,
    'FundDeployer',
    [dependencies.dispatcher, dependencies.fndzController, [], []],
    {
      addressLabel: 'fund_deployer',
      contractLabel: 'fund_deployer',
    },
  );
  console.log(`Deployed FundDeployer.sol to ${newFundDeployer.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  // Deploying New ComptrollerLib
  const newComptrollerLib = await hre.mbDeployer.deploy(
    migrator,
    'ComptrollerLib',
    [
      dependencies.dispatcher,
      newFundDeployer.mbAddress.address,
      dependencies.valueInterpreter,
      dependencies.feeManager,
      dependencies.integrationManager,
      dependencies.policyManager,
      dependencies.chainlinkPriceFeed,
    ],
    {
      addressLabel: 'comptroller_lib',
      contractLabel: 'comptroller_lib',
    },
  );
  console.log(`Deployed ComptrollerLib.sol to ${newComptrollerLib.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  // Updating the new FundDeployer address in FNDZController
  const updateFundDeployerAddressTx = await fndzController.updateFundDeployerAddress(newFundDeployer.mbAddress.address);
  console.log(`✅ updateFundDeployerAddressTx: ${updateFundDeployerAddressTx.hash}`);
  await updateFundDeployerAddressTx.wait();

  if (doSleep) await sleep(sleepTime);

  // Updating the ComptrollerLib for the new FundDeployer
  const setComptrollerLibTx = await newFundDeployer.contract.setComptrollerLib(newComptrollerLib.mbAddress.address);
  console.log(`✅ setComptrollerLibTx: ${setComptrollerLibTx.hash}`);
  await setComptrollerLibTx.wait();

  if (doSleep) await sleep(sleepTime);

  // Updating the new FundDeployer with the VaultLib address
  const setVaultLibTx = await newFundDeployer.contract.setVaultLib(dependencies.vaultLib);
  console.log(`✅ setVaultLibTx: ${setVaultLibTx.hash}`);
  await setVaultLibTx.wait();

  if (doSleep) await sleep(sleepTime);

  // Setting the release status of the new FundDeployer to Live
  const setReleaseStatusTx = await newFundDeployer.contract.setReleaseStatus(1);
  console.log(`✅ setReleaseStatusTx: ${setReleaseStatusTx.hash}`);
  await setReleaseStatusTx.wait();

  if (doSleep) await sleep(sleepTime);

  const Dispatcher = await hre.ethers.getContractFactory('Dispatcher');
  const dispatcher = Dispatcher.attach(dependencies.dispatcher);

  // Updating the Dispatcher with the new FundDeployer
  const setCurrentFundDeployerTx = await dispatcher.setCurrentFundDeployer(newFundDeployer.mbAddress.address);
  console.log(`✅ setCurrentFundDeployerTx: ${setCurrentFundDeployerTx.hash}`);
  await setCurrentFundDeployerTx.wait();

  if (doSleep) await sleep(sleepTime);

  if (!(await dispatcher.getMigrationTimelock()).eq(BigNumber.from('0'))) {
    // Set the timelock to 0. So we dont have to wait for executing the migration
    const setMigrationTimelockTx = await dispatcher.setMigrationTimelock(dependencies.migrationTimelock);
    console.log(`✅ setMigrationTimelockTx: ${setMigrationTimelockTx.hash}`);
    await setMigrationTimelockTx.wait();

    if (doSleep) await sleep(sleepTime);
  }

  // Encoding Fee configs
  const scaledPerSecondRate = convertRateToScaledPerSecondRate(dependencies.managementFeePercentage);
  const encodedManagementFeeParams = abiCoder.encode(['uint256'], [scaledPerSecondRate]);
  const encodedPerformanceFeeParams = abiCoder.encode(
    ['uint256', 'uint256'],
    [dependencies.performanceFeePercentage, dependencies.crystallizationPeriod],
  );
  const encodedFeeData = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [
      [dependencies.managementFee, dependencies.performanceFee],
      [encodedManagementFeeParams, encodedPerformanceFeeParams],
    ],
  );

  // Encoding Policy configs
  const encodedMinMaxInvestmentFeeParams = abiCoder.encode(
    ['uint256', 'uint256'],
    [dependencies.minInvestmentAmount, dependencies.maxInvestmentAmount],
  );
  const encodedPolicyData = abiCoder.encode(
    ['address[]', 'bytes[]'],
    [[dependencies.minMaxInvestment], [encodedMinMaxInvestmentFeeParams]],
  );

  // Migrating Vaults
  for (const vault of dependencies.vaults) {
    console.log(`\nStarted migrating vault: ${vault.comptrollerLabel}`);

    // Initiating the Migration Config for a vault
    const createMigratedFundConfigTx = await newFundDeployer.contract.createMigratedFundConfig(
      dependencies.denominationAsset,
      dependencies.sharesActionTimelock,
      encodedFeeData,
      encodedPolicyData,
    );
    console.log(`   ✅ createMigratedFundConfigTx: ${createMigratedFundConfigTx.hash}`);
    const migratedFundConfigReceipt = await createMigratedFundConfigTx.wait();
    const comptrollerProxyDeployedEvents = filterEventsByABI(migratedFundConfigReceipt, [
      comptrollerProxyDeployedEventABI,
    ]);
    expect(comptrollerProxyDeployedEvents.length).to.eq(1);
    const newComptrollerProxyAddress = comptrollerProxyDeployedEvents[0].args.comptrollerProxy;
    console.log(`   New ComptrollerProxy Deployed to: ${newComptrollerProxyAddress}`);

    if (doSleep) await sleep(sleepTime);

    // Signal the Migration to start
    const signalMigrationTx = await newFundDeployer.contract.signalMigration(vault.address, newComptrollerProxyAddress);
    console.log(`   ✅ signalMigrationTx: ${signalMigrationTx.hash}`);
    await signalMigrationTx.wait();

    if (doSleep) await sleep(sleepTime);

    // Executing the migration
    const executeMigrationTx = await newFundDeployer.contract.executeMigrationEmergency(vault.address, {
      gasLimit: BigNumber.from('1500000'),
    });
    console.log(`   ✅ executeMigrationTx: ${executeMigrationTx.hash}`);
    await executeMigrationTx.wait();

    if (doSleep) await sleep(sleepTime);

    // Linking the new Comptroller Proxy to the Multibaas
    await hre.mbDeployer.link(migrator, 'ComptrollerLib', newComptrollerProxyAddress, {
      addressLabel: vault.comptrollerLabel,
      contractLabel: 'comptroller_lib',
      contractVersion: '1.1',
    });

    console.log(`Migration completed for vault: ${vault.comptrollerLabel}\n`);
  }

  // Transferring Ownerships //

  const fndzControllerTransferOwnershipTx = await fndzController.transferOwnership(FNDZ_OWNER);
  console.log(`✅ fndzControllerTransferOwnershipTx: ${fndzControllerTransferOwnershipTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // For the dispatcher fndz Owner needs to claim the ownership after nominated
  const dispatcherSetNominatedOwnerTx = await dispatcher.setNominatedOwner(FNDZ_OWNER);
  console.log(`✅ dispatcherSetNominatedOwnerTx: ${dispatcherSetNominatedOwnerTx.hash}`);

  // Verifying Deployed contracts //

  await verifyContract(newFundDeployer.mbAddress.address, [
    dependencies.dispatcher,
    dependencies.fndzController,
    [],
    [],
  ]);
  console.log(`Verified FundDeployer.sol on ${newFundDeployer.mbAddress.address}`);

  await verifyContract(newComptrollerLib.mbAddress.address, [
    dependencies.dispatcher,
    newFundDeployer.mbAddress.address,
    dependencies.valueInterpreter,
    dependencies.feeManager,
    dependencies.integrationManager,
    dependencies.policyManager,
    dependencies.chainlinkPriceFeed,
  ]);
  console.log(`Verified ComptrollerLib.sol on ${newComptrollerLib.mbAddress.address}`);

  console.log(`✅ Script Completed!`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
