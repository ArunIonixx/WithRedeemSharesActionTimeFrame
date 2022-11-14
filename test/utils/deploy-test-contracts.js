/* eslint-disable @typescript-eslint/no-var-requires */
const hre = require('hardhat');
/* eslint-disable @typescript-eslint/no-var-requires */

async function deployMockContracts() {
  var instances = {};

  //Weth contract  deployment

  const WETH = await hre.ethers.getContractFactory('WETH');
  const weth = await WETH.deploy();
  await weth.deployed();
  ////console.log("WETH deployed at:", weth.address);
  instances['WETH'] = weth.address;

  const MockChainlinkAggregator = await hre.ethers.getContractFactory('MockChainlinkAggregator');
  const mockChainlinkAggregator = await MockChainlinkAggregator.deploy([0]);
  await mockChainlinkAggregator.deployed();
  //console.log("MockChainlinkAggregator deployed at:", mockChainlinkAggregator.address);
  instances['MockChainlinkAggregator'] = mockChainlinkAggregator.address;

  // CentralizedRateProvider for mockCEtherIntegratee and mockUniswapV2Integratee
  const CentralizedRateProvider = await hre.ethers.getContractFactory('CentralizedRateProvider');
  const centralizedRateProvider = await CentralizedRateProvider.deploy(weth.address, 0);
  await centralizedRateProvider.deployed();
  //console.log("CentralizedRateProvider deployed at:", centralizedRateProvider.address);
  instances['CentralizedRateProvider'] = centralizedRateProvider.address;

  // MockCEtherIntegratee for CompoundPriceFeed
  const MockCEtherIntegratee = await hre.ethers.getContractFactory('MockCEtherIntegratee');
  const mockCEtherIntegratee = await MockCEtherIntegratee.deploy(
    'Compound Ether',
    'cETH',
    8,
    weth.address,
    centralizedRateProvider.address,
    BigInt(200307431347120815233900023),
  );

  await mockCEtherIntegratee.deployed();
  //console.log("MockCEtherIntegratee deployed at:", mockCEtherIntegratee.address);
  instances['MockCEtherIntegratee'] = mockCEtherIntegratee.address;

  const MockSynthetixPriceSource = await hre.ethers.getContractFactory('MockSynthetixPriceSource');
  const mockSynthetixPriceSource = await MockSynthetixPriceSource.deploy(mockChainlinkAggregator.address);
  await mockSynthetixPriceSource.deployed();
  instances['MockSynthetixPriceSource'] = mockSynthetixPriceSource.address;

  // MockSynthetixIntegratee for SynthetixPriceFeed
  const MockSynthetixIntegratee = await hre.ethers.getContractFactory('MockSynthetixIntegratee');
  const mockSynthetixIntegratee = await MockSynthetixIntegratee.deploy(
    'Synthetix Network Token',
    'SNX',
    18,
    centralizedRateProvider.address,
    mockSynthetixPriceSource.address,
    5,
  );

  await mockSynthetixIntegratee.deployed();
  //console.log("MockSynthetixIntegratee deployed at:", mockSynthetixIntegratee.address);
  instances['MockSynthetixIntegratee'] = mockSynthetixIntegratee.address;

  // MockSUSD
  const MockSynthetixToken = await hre.ethers.getContractFactory('MockSynthetixToken');
  const mockSynthetixToken = await MockSynthetixToken.deploy(
    'Synth sUSD',
    'sUSD',
    18,
    '0x7355534400000000000000000000000000000000000000000000000000000000',
  );

  await mockSynthetixToken.deployed();
  //console.log("MockSynthetixToken deployed at:", mockSynthetixToken.address);
  instances['MockSynthetixToken'] = mockSynthetixToken.address;

  // MockUniswapV2Integratee
  const MockUniswapV2Integratee = await hre.ethers.getContractFactory('MockUniswapV2Integratee');
  const mockUniswapV2Integratee = await MockUniswapV2Integratee.deploy([], [], [], centralizedRateProvider.address, 0);

  await mockUniswapV2Integratee.deployed();
  //console.log("MockUniswapV2Integratee deployed at:", mockUniswapV2Integratee.address);
  instances['MockUniswapV2Integratee'] = mockUniswapV2Integratee.address;

  // MockZeroExV2Integratee
  const MockZeroExV2Integratee = await hre.ethers.getContractFactory('MockZeroExV2Integratee');
  const mockZeroExV2Integratee = await MockZeroExV2Integratee.deploy(
    '0x00060c003300000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000024f47261b000000000000000000000000082f1888cb73aa5ce1b7abf0b74d0c3cab50d4b4800000000000000000000000000000000000000000000000000000000',
  );
  await mockZeroExV2Integratee.deployed();
  //console.log("MockZeroExV2Integratee deployed at:", mockZeroExV2Integratee.address);
  instances['MockZeroExV2Integratee'] = mockZeroExV2Integratee.address;

  return instances;
}

async function deployMockTokens() {
  const tokens = {};

  const MockDai = await hre.ethers.getContractFactory('MockToken');
  const mockDai = await MockDai.deploy('Dai Stablecoin', 'DAI', 18);
  await mockDai.deployed();
  tokens['MockDai'] = mockDai.address;

  const MockUSDC = await hre.ethers.getContractFactory('MockToken');
  const mockUSDC = await MockUSDC.deploy('USD Coin', 'USDC', 6);
  await mockUSDC.deployed();
  //console.log("MockUSDC deployed at:", mockUSDC.address);
  tokens['MockUSDC'] = mockUSDC.address;

  const MockWBTC = await hre.ethers.getContractFactory('MockToken');
  const mockWBTC = await MockWBTC.deploy('Wrapped BTC', 'WBTC', 8);
  await mockWBTC.deployed();
  tokens['MockWBTC'] = mockWBTC.address;

  const MockBUSD = await hre.ethers.getContractFactory('MockToken');
  const mockBUSD = await MockBUSD.deploy('BUSD Token', 'BUSD', 18);
  await mockBUSD.deployed();
  tokens['MockBUSD'] = mockBUSD.address;

  const MockFNDZ = await hre.ethers.getContractFactory('MockToken');
  const mockFNDZ = await MockFNDZ.deploy('FNDZ Token', 'FNDZ', 18);
  await mockFNDZ.deployed();
  tokens['MockFNDZ'] = mockFNDZ.address;

  return tokens;
}

async function deployments() {
  var contractAddresses = {};

  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];
  const mockContracts = await deployMockContracts(deployer);
  contractAddresses['mockContracts'] = mockContracts;

  const mockTokens = await deployMockTokens(deployer);
  contractAddresses['mockTokens'] = mockTokens;

  // MockUniswapV2Factory
  const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
  const mockUniswapV2Factory = await MockUniswapV2Factory.deploy();
  await mockUniswapV2Factory.deployed();
  contractAddresses['MockUniswapV2Factory'] = mockUniswapV2Factory.address;

  // MockUniswapV2Router2
  const MockUniswapV2Router2 = await hre.ethers.getContractFactory('MockUniswapV2Router2', deployer);
  const mockUniswapV2Router2 = await MockUniswapV2Router2.deploy();
  await mockUniswapV2Router2.deployed();
  contractAddresses['MockUniswapV2Router2'] = mockUniswapV2Router2.address;

  const accessor = accounts[5];
  const ChainlinkPriceAggregator = await hre.ethers.getContractFactory('ChainlinkPriceAggregator', deployer);
  const chainlinkPriceAggregator = await hre.upgrades.deployProxy(ChainlinkPriceAggregator, [accessor.address]);
  await chainlinkPriceAggregator.deployed();
  contractAddresses['ChainlinkPriceAggregator'] = chainlinkPriceAggregator.address;

  //FNDZ Controllers (Upgradable)
  const FNDZController = await hre.ethers.getContractFactory('FNDZController', deployer);
  const fndzController = await hre.upgrades.deployProxy(FNDZController, [
    mockTokens.MockFNDZ,
    mockUniswapV2Router2.address,
    mockUniswapV2Factory.address,
    accounts[9].address,
    mockTokens.MockBUSD,
  ]);
  await fndzController.deployed();
  contractAddresses['FNDZController'] = fndzController.address;

  // Adding Approved Denomination Assets
  await fndzController.addDenominationAssets([mockTokens.MockBUSD]);

  // FNDZ Referrral Registry
  const ReferralRegistry = await hre.ethers.getContractFactory('ReferralRegistry', deployer);
  const referralRegistry = await hre.upgrades.deployProxy(ReferralRegistry, []);
  await referralRegistry.deployed();
  contractAddresses['ReferralRegistry'] = referralRegistry.address;

  // FNDZ Invest Registry
  const FNDZInvestmentRegistry = await hre.ethers.getContractFactory('FNDZInvestmentRegistry', deployer);
  const fndzInvestmentRegistry = await hre.upgrades.deployProxy(FNDZInvestmentRegistry, [mockTokens.MockFNDZ]);
  await fndzInvestmentRegistry.deployed();
  contractAddresses['FNDZInvestmentRegistry'] = fndzInvestmentRegistry.address;

  //Dispatcher deployment
  const Dispatcher = await hre.ethers.getContractFactory('Dispatcher', deployer);
  const dispatcher = await Dispatcher.deploy([]);
  await dispatcher.deployed();
  contractAddresses['Dispatcher'] = dispatcher.address;

  //Fund DeployFunction
  const FundDeployer = await hre.ethers.getContractFactory('FundDeployer', deployer);
  const fundDeployer = await FundDeployer.deploy(dispatcher.address, fndzController.address, [], []);
  await fundDeployer.deployed();
  //console.log("FundDeployer deployed at:", fundDeployer.address);
  contractAddresses['FundDeployer'] = fundDeployer.address;

  // Set Fund Deployer for FNDZController
  await fndzController.updateFundDeployerAddress(fundDeployer.address);

  //ChainlinkPriceFeed contract deployment
  const ChainlinkPriceFeed = await hre.ethers.getContractFactory('ChainlinkPriceFeed');
  const chainlinkPriceFeed = await ChainlinkPriceFeed.deploy(
    fndzController.address,
    mockContracts.WETH,
    mockContracts.MockChainlinkAggregator,
    [mockTokens.MockDai, mockTokens.MockBUSD, mockTokens.MockUSDC, mockTokens.MockFNDZ], // address[] memory _primitives,
    [
      mockContracts.MockChainlinkAggregator,
      mockContracts.MockChainlinkAggregator,
      mockContracts.MockChainlinkAggregator,
      mockContracts.MockChainlinkAggregator,
    ], // address[] memory _aggregators,
    [0, 0, 0, 0], // RateAsset[] memory _rateAssets
  );
  await chainlinkPriceFeed.deployed();
  //console.log("ChainlinkPriceFeed deployed at:", chainlinkPriceFeed.address);
  contractAddresses['ChainlinkPriceFeed'] = chainlinkPriceFeed.address;

  await chainlinkPriceFeed.setStaleRateThreshold(31536000);
  //console.log(`✅ setStaleRateThresholdTx: ${setStaleRateThresholdTx.hash}`);

  const SynthetixPriceFeed = await hre.ethers.getContractFactory('SynthetixPriceFeed');
  const synthetixPriceFeed = await SynthetixPriceFeed.deploy(
    fundDeployer.address,
    mockContracts.MockSynthetixIntegratee,
    mockContracts.MockSynthetixToken,
    [],
  );
  await synthetixPriceFeed.deployed();
  //console.log("SynthetixPriceFeed deployed at:", synthetixPriceFeed.address);
  contractAddresses['SynthetixPriceFeed'] = synthetixPriceFeed.address;

  const AggregatedDerivativePriceFeed = await hre.ethers.getContractFactory('AggregatedDerivativePriceFeed');
  const aggregatedDerivativePriceFeed = await AggregatedDerivativePriceFeed.deploy(fundDeployer.address, [], []);
  await aggregatedDerivativePriceFeed.deployed();
  //console.log("AggregatedDerivativePriceFeed deployed at:", aggregatedDerivativePriceFeed.address);
  contractAddresses['AggregatedDerivativePriceFeed'] = aggregatedDerivativePriceFeed.address;

  const FNDZStaking = await hre.ethers.getContractFactory('FNDZStaking', deployer);
  const fndzStaking = await FNDZStaking.deploy(fndzController.address);
  await fndzStaking.deployed();
  contractAddresses['FNDZStaking'] = fndzStaking.address;

  // Updating the FNDZ controller with the staking pool address
  await fndzController.updateFndzStakingPoolAddress(fndzStaking.address);

  //valueInterpreter
  const ValueInterpreter = await hre.ethers.getContractFactory('ValueInterpreter');
  const valueInterpreter = await ValueInterpreter.deploy(
    chainlinkPriceFeed.address,
    aggregatedDerivativePriceFeed.address,
  );
  await valueInterpreter.deployed();
  //console.log("ValueInterpreter deployed at:", valueInterpreter.address);
  contractAddresses['ValueInterpreter'] = valueInterpreter.address;

  //FeeManager
  const FeeManager = await hre.ethers.getContractFactory('FeeManager');
  const feeManager = await FeeManager.deploy(fundDeployer.address, fndzController.address, referralRegistry.address);
  await feeManager.deployed();
  contractAddresses['FeeManager'] = feeManager.address;

  //Policy Manager
  const PolicyManager = await hre.ethers.getContractFactory('PolicyManager');
  const policyManager = await PolicyManager.deploy(fundDeployer.address);
  await policyManager.deployed();
  //console.log("PolicyManager deployed at:", policyManager.address);
  contractAddresses['PolicyManager'] = policyManager.address;

  // IntegrationManager
  const IntegrationManager = await hre.ethers.getContractFactory('IntegrationManager');
  const integrationManager = await IntegrationManager.deploy(
    fundDeployer.address,
    policyManager.address,
    aggregatedDerivativePriceFeed.address,
    chainlinkPriceFeed.address,
    fndzInvestmentRegistry.address,
    fndzController.address
  );
  await integrationManager.deployed();
  //console.log("IntegrationManager deployed at:", integrationManager.address);
  contractAddresses['IntegrationManager'] = integrationManager.address;

  await fndzController.updateFNDZShortingBotAddress( accounts[10].address);

  // VaultLib Contract
  const VaultLib = await hre.ethers.getContractFactory('VaultLib', deployer);
  const vaultLib = await VaultLib.deploy();
  await vaultLib.deployed();
  //console.log("vaultLib deployed at:", vaultLib.address);
  contractAddresses['VaultLib'] = vaultLib.address;

  await fundDeployer.setVaultLib(vaultLib.address);

  // https://kovan.etherscan.io/tx/0xb830291dce68381ae8b1863719344b4e74421c15fb66a94345c98083d394b189
  const ComptrollerLib = await hre.ethers.getContractFactory('ComptrollerLib');
  const comptrollerLib = await ComptrollerLib.deploy(
    dispatcher.address,
    fundDeployer.address,
     valueInterpreter.address,
    feeManager.address,
    integrationManager.address,
    policyManager.address,
    chainlinkPriceFeed.address,
  );
  await comptrollerLib.deployed();
  //console.log("ComptrollerLib deployed at:", comptrollerLib.address);
  contractAddresses['ComptrollerLib'] = comptrollerLib.address;

  await fundDeployer.setComptrollerLib(comptrollerLib.address);
  //console.log(`✅ setComptrollerLibTx: ${setComptrollerLibTx.hash}`);

  // MockParaSwapV5AugustusSwapper
  const MockParaSwapV5AugustusSwapper = await hre.ethers.getContractFactory('MockParaSwapV5AugustusSwapper', deployer);
  const mockParaSwapV5AugustusSwapper = await MockParaSwapV5AugustusSwapper.deploy();
  await mockParaSwapV5AugustusSwapper.deployed();
  contractAddresses['MockParaSwapV5AugustusSwapper'] = mockParaSwapV5AugustusSwapper.address;

  //PARASWAP
  const ParaSwapV5Adapter = await hre.ethers.getContractFactory('ParaSwapV5Adapter');
  const paraSwapV5Adapter = await ParaSwapV5Adapter.deploy(
    integrationManager.address,
    mockParaSwapV5AugustusSwapper.address,
    accounts[5].address,
    [],
  );
  await paraSwapV5Adapter.deployed();
  //console.log("ParaSwapV5Adapter deployed at:", paraSwapV5Adapter.address);
  contractAddresses['ParaSwapV5Adapter'] = paraSwapV5Adapter.address;

  //MockManyParameterFee
  const MockManyParameterFee = await hre.ethers.getContractFactory('MockManyParameterFee');
  const mockManyParameterFee = await MockManyParameterFee.deploy(feeManager.address);
  await mockManyParameterFee.deployed();
  contractAddresses['MockManyParameterFee'] = mockManyParameterFee.address;

  const EntranceReferralFee = await hre.ethers.getContractFactory('EntranceReferralFee');
  const entranceReferralFee = await EntranceReferralFee.deploy(feeManager.address, referralRegistry.address);
  await entranceReferralFee.deployed();
  // console.log('ReferralFee deployed at: ', referralFee.address);
  contractAddresses['EntranceReferralFee'] = entranceReferralFee.address;
  await referralRegistry.setFeeAddress(entranceReferralFee.address);

  //ManagementFee
  const ManagementFee = await hre.ethers.getContractFactory('ManagementFee');
  const managementFee = await ManagementFee.deploy(feeManager.address);
  await managementFee.deployed();
  //console.log("ManagementFee deployed at:", managementFee.address);
  contractAddresses['ManagementFee'] = managementFee.address;

  const PerformanceFee = await hre.ethers.getContractFactory('PerformanceFee');
  const performanceFee = await PerformanceFee.deploy(feeManager.address);
  await performanceFee.deployed();
  //console.log("PerformanceFee deployed at:", performanceFee.address);
  contractAddresses['PerformanceFee'] = performanceFee.address;

  const RedeemSharesActionTimeFrame = await hre.ethers.getContractFactory('RedeemSharesActionTimeFrame');
  const redeemSharesActionTimeFrame = await RedeemSharesActionTimeFrame.deploy(feeManager.address);
  await redeemSharesActionTimeFrame.deployed();
  contractAddresses['RedeemSharesActionTimeFrame'] = redeemSharesActionTimeFrame.address;

  const FNDZInvestmentFee = await hre.ethers.getContractFactory('FNDZInvestmentFee');
  const fndzInvestmentFee = await FNDZInvestmentFee.deploy(
    feeManager.address,
    mockTokens.MockFNDZ,
    fndzInvestmentRegistry.address,
  );
  await fndzInvestmentFee.deployed();
  contractAddresses['FNDZInvestmentFee'] = fndzInvestmentFee.address;
  // Registry update
  await fndzInvestmentRegistry.setFeeAddress(fndzInvestmentFee.address);

  //InvestorWhitelist
  const InvestorWhitelist = await hre.ethers.getContractFactory('InvestorWhitelist');
  const investorWhitelist = await InvestorWhitelist.deploy(policyManager.address);
  await investorWhitelist.deployed();
  //console.log("InvestorWhitelist deployed at:", investorWhitelist.address);
  contractAddresses['InvestorWhitelist'] = investorWhitelist.address;

  const MinMaxInvestment = await hre.ethers.getContractFactory('MinMaxInvestment');
  const minMaxInvestment = await MinMaxInvestment.deploy(policyManager.address);
  await minMaxInvestment.deployed();
  //console.log("MinMaxInvestment deployed at:", minMaxInvestment.address);
  contractAddresses['MinMaxInvestment'] = minMaxInvestment.address;

  const FundActionsWrapper = await hre.ethers.getContractFactory('FundActionsWrapper');
  const fundActionsWrapper = await FundActionsWrapper.deploy(feeManager.address);
  await fundActionsWrapper.deployed();
  //console.log("FundActionsWrapper deployed at:", fundActionsWrapper.address);
  contractAddresses['FundActionsWrapper'] = fundActionsWrapper.address;

  //=========================================== pre config to be set =================================

  await integrationManager.registerAdapters([paraSwapV5Adapter.address]);

  // console.log(`✅ registerAdaptersTx: ${registerAdaptersTx.hash}`);

  await feeManager.registerFees([
    managementFee.address,
    performanceFee.address,
    entranceReferralFee.address,
    fndzInvestmentFee.address,
    redeemSharesActionTimeFrame.address
  ]);

  // Set FNDZController Fee Configuration
  await fndzController.setFeeConfiguration(
    managementFee.address,
    [0], // minimum of 0%
    [hre.ethers.BigNumber.from('1000000000965855133796871400')], // maximum of 3% (formatted as scaledPerSecondRate)
  );

  await fndzController.setFeeConfiguration(
    performanceFee.address,
    [0, hre.ethers.BigNumber.from('604800')], // minimum of 0%, minimum crystallization period is one week
    [hre.ethers.utils.parseEther('0.3'), hre.ethers.BigNumber.from('7884000')], // maximum of 30%, maximum crystallization period is quarterly (91.25 days)
  );

  // Referral Fee
  await fndzController.setFeeConfiguration(
    entranceReferralFee.address,
    [hre.ethers.utils.parseEther('0.005')], // minimum of 0.5%
    [hre.ethers.utils.parseEther('0.01')], // Maximum of 1%
  );

  // FNDZ Invest fee
  await fndzController.setFeeConfiguration(
    fndzInvestmentFee.address,
    [hre.ethers.utils.parseEther('0.01')], // minimum of 1%
    [hre.ethers.utils.parseEther('0.02')], // maximum of 2%
  );
  const DAY = 86400;
  await fndzController.setFeeConfiguration(
    redeemSharesActionTimeFrame.address,
    [2*DAY,10*DAY], // minimum of 2
    [10*DAY,40*DAY], // maximum of 40
  );

  //console.log(`✅ registerFeesTx: ${registerFeesTx.hash}`);

  await policyManager.registerPolicies([investorWhitelist.address, minMaxInvestment.address]);

  //console.log(`✅ registerPoliciesTx: ${registerPoliciesTx.hash}`);

  await fundDeployer.setReleaseStatus(1);

  await dispatcher.setCurrentFundDeployer(fundDeployer.address);

  await dispatcher.setMigrationTimelock(0);

  // Adding Mock5AugustusSwapper & MockUniswapV2Router2 as minter
  // To mint the amount that needs while trading and redeemAndSwap
  const MockToken = await hre.ethers.getContractFactory('MockToken', deployer);
  const usdcToken = MockToken.attach(contractAddresses.mockTokens.MockUSDC);
  await usdcToken.addMinters([contractAddresses.MockParaSwapV5AugustusSwapper, contractAddresses.MockUniswapV2Router2]);
  const daiToken = MockToken.attach(contractAddresses.mockTokens.MockDai);
  await daiToken.addMinters([contractAddresses.MockParaSwapV5AugustusSwapper, contractAddresses.MockUniswapV2Router2]);
  const wbtcToken = MockToken.attach(contractAddresses.mockTokens.MockWBTC);
  await wbtcToken.addMinters([contractAddresses.MockParaSwapV5AugustusSwapper, contractAddresses.MockUniswapV2Router2]);
  const busdToken = MockToken.attach(contractAddresses.mockTokens.MockBUSD);
  await busdToken.addMinters([contractAddresses.MockParaSwapV5AugustusSwapper, contractAddresses.MockUniswapV2Router2]);
  const fndzToken = MockToken.attach(contractAddresses.mockTokens.MockFNDZ);
  await fndzToken.addMinters([contractAddresses.MockParaSwapV5AugustusSwapper, contractAddresses.MockUniswapV2Router2]);
    
  return contractAddresses;
}

module.exports = {
  deployments,
};
