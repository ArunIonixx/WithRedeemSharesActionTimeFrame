// hre is undefined if we try to require it here, leaving it commented out for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
// const { hre } = require('hardhat');
// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
/* eslint-disable @typescript-eslint/no-var-requires */
const { verifyContract } = require('./utils/verifyContract');

const dependencies = {
  wethToken: '0xc778417e063141139fce010982780140aa0cd5ab', // https://ropsten.etherscan.io/token/0xc778417e063141139fce010982780140aa0cd5ab
  daiToken: '0xaD6D458402F60fD3Bd25163575031ACDce07538D', // https://ropsten.etherscan.io/token/0xaD6D458402F60fD3Bd25163575031ACDce07538D
  fndzToken: '0x366a0AE266af935d3f3C0570e61baC3E61088232', // https://ropsten.etherscan.io/address/0x366a0ae266af935d3f3c0570e61bac3e61088232
  // eacAggregatorProxy: '0x14137fA0D2Cf232922840081166a6a05C957bA4c', //https://ropsten.etherscan.io/address/0x14137fA0D2Cf232922840081166a6a05C957bA4c#code
  // cethToken: '0x859e9d8a4edadfedb5a2ff311243af80f85a91b8', // https://ropsten.etherscan.io/token/0x859e9d8a4edadfedb5a2ff311243af80f85a91b8
  augustusSwapper: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57', // https://ropsten.etherscan.io/address/0x3d0fc2b7a17d61915bcca984b9eaa087c5486d18#code
  tokenTransferProxy: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae', // https://ropsten.etherscan.io/address/0xdb28dc14e5eb60559844f6f900d23dce35fcae33#code,
  uniswapV2Router02: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // https://ropsten.etherscan.io/address/0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D#code
  uniswapV2Factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',

  // PriceAggregator of FNDZ's custom chainlink node
  chainlinkPriceAggregator: '0xfB36a68a7FE5287De7019f9250Fed5dA3d8eBe64',
};

// Ropsten tokens which are custom deployed by mocking Binance tokens
const mockTokens = {
  ADA: '0xD990a0C61dbf10E64E2EFaCD83B545592175D781',
  BUSD: '0x4d32fe9f08bf1626d1F9c400F827d5634ba4E6c7',
  BTCB: '0x4584154BA4E4E78C77Dce6940146EcDF56754844',
  DAI: '0x93bC75e48db457e15edA0bE401C5192DB43a6B99',
  ETH: '0xadcA16f4A1F75E402a3696AF790e47BA268ac7DB',
  FNDZ: '0x366a0AE266af935d3f3C0570e61baC3E61088232',
  SUSHI: '0xA84db3cE21a49259aab4FA19Fc0a68630C2a1F8B',
  TRX: '0x3F7C5c399e9E0C7D4f77406Fd5a15CB0246fc442',
  USDT: '0x2f72afd6713AED3d52CE28B1f8eB673520CB8B0F',
  WBNB: '0x60E9fEc7B3ec8c27A6382448e28F0E92023d614e',
  ZIL: '0x5Aa3446B2614b397Be71d7A4fE3d37C30B63e70a',
};

// Price aggregator proxies of our custom chainlink node
// ChainLinkPriceAggregator provides prices to these proxies
const priceAggregators = {
  ADA: {
    rateAsset: 1,
    aggregator: '0x35b60461F12721c0E9643419CFcB0B43592bbcf9',
  },
  BUSD: {
    rateAsset: 1,
    aggregator: '0x9E0C1cF2b0a4Db4b019244ED35EBE2393c350F25',
  },
  BTCB: {
    rateAsset: 1,
    aggregator: '0xa8F378e3789bBb12b3eef7b2368036Cc2AD581b1',
  },
  DAI: {
    rateAsset: 1,
    aggregator: '0x81BAa62be13a82f957E1C0B779207f8F68194501',
  },
  ETH: {
    rateAsset: 1,
    aggregator: '0x08db8a3858EfeC8640A2129957333896272DcC20',
  },
  FNDZ: {
    rateAsset: 1,
    aggregator: '0x1AF24D6B16cfFB5a5401c57F3C385A8c09Cff811',
  },
  SUSHI: {
    rateAsset: 1,
    aggregator: '0x8875B5EF566CBC33A893887F0F34097DEcB3eEBB',
  },
  TRX: {
    rateAsset: 1,
    aggregator: '0xDf5865df1F8bBDccB4797A5Ea04055574895EA5d',
  },
  USDT: {
    rateAsset: 1,
    aggregator: '0x7C2FDC2766cE0a5DeeE5CD4DbB24a881Bd6A0754',
  },
  WBNB: {
    rateAsset: 1,
    aggregator: '0x318e56A7B52819A2d12c10f313592c8199E55A0F',
  },
  ZIL: {
    rateAsset: 1,
    aggregator: '0xE1DFA630C469eeA8e80FE99CF489B1A252Af5d97',
  },
};

// const ionixxDevAddresses = [
//   '0xEb8CD25028c78Bef31aeB0036A9ACA5A67362e28',
//   '0xe3FDA77546BAEe76E9c9e6dd5C8bc98a31f4E21a',
//   '0xAaE31f119dE0bc9F4AEd9ab5AB46077CEd4918Dc',
// ];

let doSleep = false;
const sleepTime = 3000;

function sleep(ms) {
  console.log(`\nSleeping for ${ms}ms...\n`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deployMockContracts(deployer) {
  const results = {};
  const mockChainlinkAggregator = await hre.mbDeployer.deploy(deployer, 'MockChainlinkAggregator', [0], {
    addressLabel: 'mock_chainlink_aggregator',
    contractLabel: 'mock_chainlink_aggregator',
  });

  results['mockChainlinkAggregator'] = mockChainlinkAggregator.mbAddress.address;

  if (doSleep) await sleep(sleepTime);

  return results;
}

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const networkID = await hre.network.provider.send('eth_chainId', []);

  if (networkID === '0x3') doSleep = true; // sleep between transactions when deploying on ropsten

  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];

  const mockContracts = await deployMockContracts(deployer);

  if (doSleep) await sleep(sleepTime);

  const fndzController = await hre.mbDeployer.deployProxy(
    deployer,
    'FNDZController',
    [
      dependencies.fndzToken,
      dependencies.uniswapV2Router02,
      dependencies.uniswapV2Factory,
      '0xd8e57D2b2ADf4386159d929CC79Fe30c4123a1EB', // cg faucet operator address
      dependencies.wethToken,
    ],
    {
      addressLabel: 'fndz_controller',
      contractLabel: 'fndz_controller',
    },
  );

  console.log(`Deployed FNDZController.sol to ${fndzController.mbAddress.address}`);

  await verifyContract(fndzController.implementationAddress, []);

  console.log(`Verified FNDZController.sol on ${fndzController.implementationAddress}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerAddDenominationAssetsTx = await fndzController.contract.addDenominationAssets([
    mockTokens.BUSD,
    mockTokens.DAI,
    mockTokens.USDT,
  ]);
  console.log(`✅ fndzControllerAddDenominationAssetsTx: ${fndzControllerAddDenominationAssetsTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const referralRegistry = await hre.mbDeployer.deployProxy(deployer, 'ReferralRegistry', [], {
    addressLabel: 'referral_registry',
    contractLabel: 'referral_registry',
  });

  console.log(`Deployed ReferralRegistry.sol to ${referralRegistry.mbAddress.address}`);

  await verifyContract(referralRegistry.implementationAddress, []);

  console.log(`Verified ReferralRegistry.sol on ${referralRegistry.implementationAddress}`);

  if (doSleep) await sleep(sleepTime);

  const fndzInvestmentRegistry = await hre.mbDeployer.deployProxy(
    deployer,
    'FNDZInvestmentRegistry',
    [dependencies.fndzToken],
    {
      addressLabel: 'fndz_investment_registry',
      contractLabel: 'fndz_investment_registry',
    },
  );

  console.log(`Deployed FNDZInvestmentRegistry.sol to ${fndzInvestmentRegistry.mbAddress.address}`);

  await verifyContract(fndzInvestmentRegistry.implementationAddress, []);

  console.log(`Verified FNDZInvestmentRegistry.sol on ${fndzInvestmentRegistry.implementationAddress}`);

  if (doSleep) await sleep(sleepTime);

  const dispatcher = await hre.mbDeployer.deploy(deployer, 'Dispatcher', [], {
    addressLabel: 'dispatcher',
    contractLabel: 'dispatcher',
  });

  console.log(`Deployed Dispatcher.sol to ${dispatcher.mbAddress.address}`);

  await verifyContract(dispatcher.mbAddress.address, []);

  console.log(`Verified Dispatcher.sol on ${dispatcher.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fundDeployer = await hre.mbDeployer.deploy(
    deployer,
    'FundDeployer',
    [
      dispatcher.mbAddress.address,
      fndzController.mbAddress.address,
      [], // address[] memory _vaultCallContracts TODO MockSynthetixIntegratee
      [], // bytes4[] memory _vaultCallSelectors TODO
    ],
    {
      addressLabel: 'fund_deployer',
      contractLabel: 'fund_deployer',
    },
  );

  console.log(`Deployed FundDeployer.sol to ${fundDeployer.mbAddress.address}`);

  await verifyContract(fundDeployer.mbAddress.address, [
    dispatcher.mbAddress.address,
    fndzController.mbAddress.address,
    [], // address[] memory _vaultCallContracts TODO MockSynthetixIntegratee
    [], // bytes4[] memory _vaultCallSelectors TODO
  ]);

  console.log(`Verified FundDeployer.sol on ${fundDeployer.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerUpdateFundDeployerTx = await fndzController.contract.updateFundDeployerAddress(
    fundDeployer.mbAddress.address,
  );
  console.log(`✅ fndzControllerUpdateFundDeployerTx: ${fndzControllerUpdateFundDeployerTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // Listing out primitives and Aggregators
  var primitiveTokens = [];
  var aggregators = [];
  var rateAssets = [];
  for (var symbol in mockTokens) {
    primitiveTokens.push(mockTokens[symbol]);
    aggregators.push(priceAggregators[symbol].aggregator);
    rateAssets.push(priceAggregators[symbol].rateAsset);
  }

  const chainlinkPriceFeed = await hre.mbDeployer.deploy(
    deployer,
    'ChainlinkPriceFeed',
    [
      fndzController.mbAddress.address, // address _fndzController,
      dependencies.wethToken, // address _wethToken,
      networkID === '0x3' ? priceAggregators.ETH.aggregator : mockContracts.mockChainlinkAggregator, // address _ethUsdAggregator, EACAggregatorProxy
      networkID === '0x3' ? primitiveTokens : [], // address[] memory _primitives,
      networkID === '0x3' ? aggregators : [], // address[] memory _aggregators,
      networkID === '0x3' ? rateAssets : [], // RateAsset[] memory _rateAssets
    ],
    {
      addressLabel: 'chainlink_price_feed',
      contractLabel: 'chainlink_price_feed',
    },
  );

  console.log(`Deployed ChainlinkPriceFeed.sol to ${chainlinkPriceFeed.mbAddress.address}`);

  await verifyContract(chainlinkPriceFeed.mbAddress.address, [
    fndzController.mbAddress.address, // address _fndzController,
    dependencies.wethToken, // address _wethToken,
    networkID === '0x3' ? priceAggregators.ETH.aggregator : mockContracts.mockChainlinkAggregator, // address _ethUsdAggregator, EACAggregatorProxy
    networkID === '0x3' ? primitiveTokens : [], // address[] memory _primitives,
    networkID === '0x3' ? aggregators : [], // address[] memory _aggregators,
    networkID === '0x3' ? rateAssets : [], // RateAsset[] memory _rateAssets
  ]);

  console.log(`Verified ChainlinkPriceFeed.sol on ${chainlinkPriceFeed.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setStaleRateThresholdTx = await chainlinkPriceFeed.contract.setStaleRateThreshold(31536000);
  console.log(`✅ setStaleRateThresholdTx: ${setStaleRateThresholdTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // @dev - Derivative Tokens and Derivative price feeds can be added in Future
  const aggregatedDerivativePriceFeed = await hre.mbDeployer.deploy(
    deployer,
    'AggregatedDerivativePriceFeed',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer,
      [], // address[] memory _derivatives,
      [], // address[] memory _priceFeeds
    ],
    {
      addressLabel: 'aggregated_derivative_price_feed',
      contractLabel: 'aggregated_derivative_price_feed',
    },
  );

  console.log(`Deployed AggregatedDerivativePriceFeed.sol to ${aggregatedDerivativePriceFeed.mbAddress.address}`);

  await verifyContract(aggregatedDerivativePriceFeed.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer,
    [], // address[] memory _derivatives,
    [], // address[] memory _priceFeeds
  ]);

  console.log(`Verified AggregatedDerivativePriceFeed.sol on ${aggregatedDerivativePriceFeed.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzStaking = await hre.mbDeployer.deploy(deployer, 'FNDZStaking', [fndzController.mbAddress.address], {
    addressLabel: 'fndz_staking',
    contractLabel: 'fndz_staking',
  });

  console.log(`Deployed FNDZStaking.sol to ${fndzStaking.mbAddress.address}`);

  await verifyContract(fndzStaking.mbAddress.address, [fndzController.mbAddress.address]);

  console.log(`Verified FNDZStaking.sol on ${fndzStaking.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerUpdateFndzStakingPoolAddressTx = await fndzController.contract.updateFndzStakingPoolAddress(
    fndzStaking.mbAddress.address,
  );
  console.log(`✅ fndzControllerUpdateFndzStakingPoolAddressTx: ${fndzControllerUpdateFndzStakingPoolAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzStakingAddTrackedAssetsTx = await fndzStaking.contract.addTrackedAssets(primitiveTokens);
  console.log(`✅ fndzStakingAddTrackedAssetsTx: ${fndzStakingAddTrackedAssetsTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const valueInterpreter = await hre.mbDeployer.deploy(
    deployer,
    'ValueInterpreter',
    [
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
      aggregatedDerivativePriceFeed.mbAddress.address, // address _aggregatedDerivativePriceFeed
    ],
    {
      addressLabel: 'value_interpreter',
      contractLabel: 'value_interpreter',
    },
  );

  console.log(`Deployed ValueInterpreter.sol to ${valueInterpreter.mbAddress.address}`);

  await verifyContract(valueInterpreter.mbAddress.address, [
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
    aggregatedDerivativePriceFeed.mbAddress.address, // address _aggregatedDerivativePriceFeed
  ]);

  console.log(`Verified ValueInterpreter.sol on ${valueInterpreter.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const feeManager = await hre.mbDeployer.deploy(
    deployer,
    'FeeManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer
      fndzController.mbAddress.address,
      referralRegistry.mbAddress.address,
    ],
    {
      addressLabel: 'fee_manager',
      contractLabel: 'fee_manager',
    },
  );

  console.log(`Deployed FeeManager.sol to ${feeManager.mbAddress.address}`);

  await verifyContract(feeManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer
    fndzController.mbAddress.address,
    referralRegistry.mbAddress.address,
  ]);

  console.log(`Verified FeeManager.sol on ${feeManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const policyManager = await hre.mbDeployer.deploy(
    deployer,
    'PolicyManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer
    ],
    {
      addressLabel: 'policy_manager',
      contractLabel: 'policy_manager',
    },
  );

  console.log(`Deployed PolicyManager.sol to ${policyManager.mbAddress.address}`);

  await verifyContract(policyManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer
  ]);

  console.log(`Verified PolicyManager.sol on ${policyManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const integrationManager = await hre.mbDeployer.deploy(
    deployer,
    'IntegrationManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer,
      policyManager.mbAddress.address, // address _policyManager,
      aggregatedDerivativePriceFeed.mbAddress.address, // address _derivativePriceFeed,
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
      fndzInvestmentRegistry.mbAddress.address,
    ],
    {
      addressLabel: 'integration_manager',
      contractLabel: 'integration_manager',
    },
  );

  console.log(`Deployed IntegrationManager.sol to ${integrationManager.mbAddress.address}`);

  await verifyContract(integrationManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer,
    policyManager.mbAddress.address, // address _policyManager,
    aggregatedDerivativePriceFeed.mbAddress.address, // address _derivativePriceFeed,
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
    fndzInvestmentRegistry.mbAddress.address,
  ]);

  console.log(`Verified IntegrationManager.sol on ${integrationManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const vaultLib = await hre.mbDeployer.deploy(deployer, 'VaultLib', [], {
    addressLabel: 'vault_lib',
    contractLabel: 'vault_lib',
  });

  console.log(`Deployed VaultLib.sol to ${vaultLib.mbAddress.address}`);

  await verifyContract(vaultLib.mbAddress.address, []);

  console.log(`Verified VaultLib.sol on ${vaultLib.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setVaultLibTx = await fundDeployer.contract.setVaultLib(vaultLib.mbAddress.address);
  console.log(`✅ setVaultLibTx: ${setVaultLibTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const comptrollerLib = await hre.mbDeployer.deploy(
    deployer,
    'ComptrollerLib',
    [
      dispatcher.mbAddress.address, // address _dispatcher,
      fundDeployer.mbAddress.address, // address _fundDeployer,
      valueInterpreter.mbAddress.address, // address _valueInterpreter,
      feeManager.mbAddress.address, // address _feeManager,
      integrationManager.mbAddress.address, // address _integrationManager,
      policyManager.mbAddress.address, // address _policyManager,
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed,
    ],
    {
      addressLabel: 'comptroller_lib',
      contractLabel: 'comptroller_lib',
    },
  );

  console.log(`Deployed ComptrollerLib.sol to ${comptrollerLib.mbAddress.address}`);

  await verifyContract(comptrollerLib.mbAddress.address, [
    dispatcher.mbAddress.address, // address _dispatcher,
    fundDeployer.mbAddress.address, // address _fundDeployer,
    valueInterpreter.mbAddress.address, // address _valueInterpreter,
    feeManager.mbAddress.address, // address _feeManager,
    integrationManager.mbAddress.address, // address _integrationManager,
    policyManager.mbAddress.address, // address _policyManager,
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed,
  ]);

  console.log(`Verified ComptrollerLib.sol on ${comptrollerLib.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setComptrollerLibTx = await fundDeployer.contract.setComptrollerLib(comptrollerLib.mbAddress.address);
  console.log(`✅ setComptrollerLibTx: ${setComptrollerLibTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // PARASWAP
  const paraSwapV5Adapter = await hre.mbDeployer.deploy(
    deployer,
    'ParaSwapV5Adapter',
    [
      integrationManager.mbAddress.address, // address _integrationManager,
      dependencies.augustusSwapper, // address _augustusSwapper,
      dependencies.tokenTransferProxy, // address _tokenTransferProxy
    ],
    {
      addressLabel: 'para_swap_v5_adapter',
      contractLabel: 'para_swap_v5_adapter',
    },
  );

  console.log(`Deployed ParaSwapV5Adapter.sol to ${paraSwapV5Adapter.mbAddress.address}`);

  await verifyContract(paraSwapV5Adapter.mbAddress.address, [
    integrationManager.mbAddress.address, // address _integrationManager,
    dependencies.augustusSwapper, // address _augustusSwapper,
    dependencies.tokenTransferProxy, // address _tokenTransferProxy
  ]);

  console.log(`Verified ParaSwapV5Adapter.sol on ${paraSwapV5Adapter.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const managementFee = await hre.mbDeployer.deploy(
    deployer,
    'ManagementFee',
    [
      feeManager.mbAddress.address, // address _feeManager,
    ],
    {
      addressLabel: 'management_fee',
      contractLabel: 'management_fee',
    },
  );

  console.log(`Deployed ManagementFee.sol to ${managementFee.mbAddress.address}`);

  await verifyContract(managementFee.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager,
  ]);

  console.log(`Verified ManagementFee.sol on ${managementFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const performanceFee = await hre.mbDeployer.deploy(
    deployer,
    'PerformanceFee',
    [
      feeManager.mbAddress.address, // address _feeManager,
    ],
    {
      addressLabel: 'performance_fee',
      contractLabel: 'performance_fee',
    },
  );

  console.log(`Deployed PerformanceFee.sol to ${performanceFee.mbAddress.address}`);

  await verifyContract(performanceFee.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager,
  ]);

  console.log(`Verified PerformanceFee.sol on ${performanceFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const entranceReferralFee = await hre.mbDeployer.deploy(
    deployer,
    'EntranceReferralFee',
    [feeManager.mbAddress.address, referralRegistry.mbAddress.address],
    {
      addressLabel: 'entrance_referral_fee',
      contractLabel: 'entrance_referral_fee',
    },
  );

  console.log(`Deployed EntranceReferralFee.sol to ${entranceReferralFee.mbAddress.address}`);

  await verifyContract(entranceReferralFee.mbAddress.address, [
    feeManager.mbAddress.address,
    referralRegistry.mbAddress.address,
  ]);

  console.log(`Verified EntranceReferralFee.sol on ${entranceReferralFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setEntranceReferralFeeAddressTx = await referralRegistry.contract.setFeeAddress(
    entranceReferralFee.mbAddress.address,
  );
  console.log(`✅ setEntranceReferralFeeAddressTx: ${setEntranceReferralFeeAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzInvestmentFee = await hre.mbDeployer.deploy(
    deployer,
    'FNDZInvestmentFee',
    [feeManager.mbAddress.address, dependencies.fndzToken, fndzInvestmentRegistry.mbAddress.address],
    {
      addressLabel: 'fndz_investment_fee',
      contractLabel: 'fndz_investment_fee',
    },
  );

  console.log(`Deployed FNDZInvestmentFee.sol to ${fndzInvestmentFee.mbAddress.address}`);

  await verifyContract(fndzInvestmentFee.mbAddress.address, [
    feeManager.mbAddress.address,
    dependencies.fndzToken,
    fndzInvestmentRegistry.mbAddress.address,
  ]);

  console.log(`Verified FNDZInvestmentFee.sol on ${fndzInvestmentFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setFNDZInvesFeeAddressTx = await fndzInvestmentRegistry.contract.setFeeAddress(
    fndzInvestmentFee.mbAddress.address,
  );
  console.log(`✅ setFNDZInvesFeeAddressTx: ${setFNDZInvesFeeAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const investorWhitelist = await hre.mbDeployer.deploy(
    deployer,
    'InvestorWhitelist',
    [
      policyManager.mbAddress.address, // address _policyManager,
    ],
    {
      addressLabel: 'investor_whitelist',
      contractLabel: 'investor_whitelist',
    },
  );

  console.log(`Deployed InvestorWhitelist.sol to ${investorWhitelist.mbAddress.address}`);

  await verifyContract(investorWhitelist.mbAddress.address, [
    policyManager.mbAddress.address, // address _policyManager,
  ]);

  console.log(`Verified InvestorWhitelist.sol on ${investorWhitelist.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const minMaxInvestment = await hre.mbDeployer.deploy(
    deployer,
    'MinMaxInvestment',
    [
      policyManager.mbAddress.address, // address _policyManager,
    ],
    {
      addressLabel: 'min_max_investment',
      contractLabel: 'min_max_investment',
    },
  );

  console.log(`Deployed MinMaxInvestment.sol to ${minMaxInvestment.mbAddress.address}`);

  await verifyContract(minMaxInvestment.mbAddress.address, [
    policyManager.mbAddress.address, // address _policyManager,
  ]);

  console.log(`Verified MinMaxInvestment.sol on ${minMaxInvestment.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fundActionsWrapper = await hre.mbDeployer.deploy(
    deployer,
    'FundActionsWrapper',
    [
      feeManager.mbAddress.address, // address _feeManager
    ],
    {
      addressLabel: 'fund_actions_wrapper',
      contractLabel: 'fund_actions_wrapper',
    },
  );

  console.log(`Deployed FundActionsWrapper.sol to ${fundActionsWrapper.mbAddress.address}`);

  await verifyContract(fundActionsWrapper.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager
  ]);

  console.log(`Verified FundActionsWrapper.sol on ${fundActionsWrapper.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const registerAdaptersTx = await integrationManager.contract.registerAdapters([paraSwapV5Adapter.mbAddress.address]);

  console.log(`✅ registerAdaptersTx: ${registerAdaptersTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const registerFeesTx = await feeManager.contract.registerFees([
    managementFee.mbAddress.address,
    performanceFee.mbAddress.address,
    entranceReferralFee.mbAddress.address,
    fndzInvestmentFee.mbAddress.address,
  ]);

  console.log(`✅ registerFeesTx: ${registerFeesTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetManagementFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    managementFee.mbAddress.address,
    [0], // minimum of 0%
    [hre.ethers.BigNumber.from('1000000000965855133796871400')], // maximum of 3% (formatted as scaledPerSecondRate)
  );
  console.log(
    `✅ fndzControllerSetManagementFeeConfigurationTx: ${fndzControllerSetManagementFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetPerformanceFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    performanceFee.mbAddress.address,
    [0, hre.ethers.BigNumber.from('604800')], // minimum of 0%, minimum crystallization period is one week
    [hre.ethers.utils.parseEther('0.3'), hre.ethers.BigNumber.from('7884000')], // maximum of 30%, maximum crystallization period is quarterly (91.25 days)
  );
  console.log(
    `✅ fndzControllerSetPerformanceFeeConfigurationTx: ${fndzControllerSetPerformanceFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetEntranceReferralFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    entranceReferralFee.mbAddress.address,
    [hre.ethers.utils.parseEther('0.005')], // minimum of 0.5%
    [hre.ethers.utils.parseEther('0.01')], // maximum of 1%
  );
  console.log(
    `✅ fndzControllerSetEntranceReferralFeeConfigurationTx: ${fndzControllerSetEntranceReferralFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetFndzInvestmentFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    fndzInvestmentFee.mbAddress.address,
    [hre.ethers.utils.parseEther('0.01')], // minimum of 1%
    [hre.ethers.utils.parseEther('0.02')], // maximum of 2%
  );
  console.log(
    `✅ fndzControllerSetFndzInvestmentFeeConfigurationTx: ${fndzControllerSetFndzInvestmentFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const registerPoliciesTx = await policyManager.contract.registerPolicies([
    investorWhitelist.mbAddress.address,
    minMaxInvestment.mbAddress.address,
  ]);

  console.log(`✅ registerPoliciesTx: ${registerPoliciesTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setReleaseStatusTx = await fundDeployer.contract.setReleaseStatus(1);

  console.log(`✅ setReleaseStatusTx: ${setReleaseStatusTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setCurrentFundDeployerTx = await dispatcher.contract.setCurrentFundDeployer(fundDeployer.mbAddress.address);

  console.log(`✅ setCurrentFundDeployerTx: ${setCurrentFundDeployerTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setMigrationTimelockTx = await dispatcher.contract.setMigrationTimelock(0);

  console.log(`✅ setMigrationTimelockTx: ${setMigrationTimelockTx.hash}`);

  if (doSleep) await sleep(sleepTime);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
