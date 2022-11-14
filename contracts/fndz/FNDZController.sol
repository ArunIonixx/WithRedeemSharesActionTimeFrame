// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";
import "../release/core/fund-deployer/IFundDeployer.sol";
import "./interfaces/IFNDZController.sol";
import "./interfaces/IFNDZStaking.sol";

contract FNDZController is IFNDZController, OwnableUpgradeable {
    using SafeMath for uint256;
    using BytesLib for bytes;

    // Constants
    uint256 private constant RATE_DIVISOR = 10**18;

    // State Variables
    address public override fndzToken;
    mapping(address => FeeConfiguration) private feeConfigurations;
    mapping(address => bool) private approvedDenominationAssets;
    address private uniswapV2Router02;
    address public uniswapV2Factory;
    address public fndzStakingPool;
    address public override fndzDao;
    address public fndzDaoDesiredToken;
    address public fundDeployer;

    uint256 private managementFeeVaultOwnerSplit;
    uint256 private managementFeeStakingAndDaoSplit;
    uint256 private performanceFeeVaultOwnerSplitBase;
    uint256 private performanceFeeVaultOwnerSplitMax;
    uint256 private performanceFeeTierZeroAmountStaked;
    uint256 private performanceFeeAmountStakedIncrement;
    uint256 private performanceFeeVaultOwnerSplitIncreasePerTier;
    uint256 private inlineSwapDeadlineIncrement;
    uint256 private inlineSwapMinimumPercentReceived;
    uint256 private paraSwapFee;
    address public FNDZShortingBot;


    // Structs
    struct FeeConfiguration {
        bool valid;
        uint256[] parameterMinValues;
        uint256[] parameterMaxValues;
    }

    // Events
    event DenominationAssetAdded(address asset);
    event DenominationAssetRemoved(address asset);
    event InlineSwapRouterUpdated(address _oldRouter, address _newRouter);
    event InlineSwapFactoryUpdated(address _oldFactory, address _newFactory);
    event FndzStakingPoolUpdated(address _oldPool, address _newPool);
    event FndzDaoUpdated(address _oldDao, address _newDao);
    event FndzDaoDesiredTokenUpdated(address _oldToken, address _newToken);
    event FundDeployerUpdated(address _oldFundDeployer, address _newFundDeployer);
    event FeeConfigurationUpdated(address _feeAddress);
    event FeeConfigurationRemoved(address _feeAddress);
    event ParaSwapFeeUpdated(uint256 _fee);
    event ManagementFeeSplitUpdated(
        uint256 _oldVaultOwnerSplit,
        uint256 _oldDaoAndStakingSplit,
        uint256 _newVaultOwnerSplit,
        uint256 _newDaoAndStakingSplit
    );
    event PerformanceFeeSplitUpdated(
        uint256 _oldVaultOwnerSplitBase,
        uint256 _nextVaultOwnerSplitBase,
        uint256 _oldVaultOwnerSplitMax,
        uint256 _nextVaultOwnerSplitMax,
        uint256 _oldTierZeroAmountStaked,
        uint256 _nextTierZeroAmountStaked,
        uint256 _oldAmountStakedIncrement,
        uint256 _nextAmountStakedIncrement,
        uint256 _oldVaultOwnerSplitIncreasePerTier,
        uint256 _nextVaultOwnerSplitIncreasePerTier
    );
    event InlineSwapAllowancesUpdated(
        uint256 _oldDeadlineIncrement,
        uint256 _oldMinimumPercentageReceived,
        uint256 _newDeadlineIncrement,
        uint256 _newMinimumPercentageReceived
    );

    modifier notZeroAddress(address _address) {
        require(_address != address(0), "Address should not be zero address");
        _;
    }

    /// @notice Initialize the upgradeable FNDZController smart contract
    /// @param _uniswapV2Router02 The address of the Uniswap V2 Router 02 contract
    /// @param _uniswapV2Factory The address of the Uniswap V2 Factory contract
    /// @param _fndzDao The address of the FNDZ DAO
    /// @param _fndzDaoDesiredToken The address of the token in which the FNDZ DAO wishes to collect fee payments
    function initialize(
        address _fndzToken,
        address _uniswapV2Router02,
        address _uniswapV2Factory,
        address _fndzDao,
        address _fndzDaoDesiredToken
    ) public initializer {
        __Ownable_init();

        /// State Variable Initializations ///
        fndzToken = _fndzToken;
        // Management Fee splits
        managementFeeVaultOwnerSplit = 500000000000000000; // 50% of management fee  to vault owner
        managementFeeStakingAndDaoSplit = 250000000000000000; // 25% of management fee goes to staking and dao (each)
        // Performance Fee splits
        performanceFeeVaultOwnerSplitBase = 500000000000000000; // 50% of performance fee to vault owner
        performanceFeeVaultOwnerSplitMax = 750000000000000000; // vault owner is entitled to a maximum of 75% of the performance fee
        // To qualify for the first tier of a larger share of the performance fee, the vaultOwner must stake
        // performanceFeeTierZeroAmountStaked + performanceFeeAmountStakedIncrement = 1000 FNDZ Tokens
        performanceFeeTierZeroAmountStaked = 0;
        performanceFeeAmountStakedIncrement = 1000000000000000000000; // 1000 FNDZ
        // For every additional 1000 FNDZ staked, the vault owner gets 2.5% more of the performance fee
        performanceFeeVaultOwnerSplitIncreasePerTier = 25000000000000000;
        // Inline swap allowances
        inlineSwapDeadlineIncrement = 60; // the number of seconds within which a swap must succeed during inline fee share redemption
        inlineSwapMinimumPercentReceived = 950000000000000000; // the minimum percent of swap destination tokens that must be received relative to the spot price
        // ParaSwap Fee
        paraSwapFee = 20; // DivideFactor 10000 (Eg, 10% = 1000)

        uniswapV2Router02 = _uniswapV2Router02;
        uniswapV2Factory = _uniswapV2Factory;
        fndzDao = _fndzDao;
        fndzDaoDesiredToken = _fndzDaoDesiredToken;
        emit InlineSwapRouterUpdated(address(0), _uniswapV2Router02);
        emit InlineSwapFactoryUpdated(address(0), _uniswapV2Factory);
        emit FndzDaoUpdated(address(0), _fndzDao);
        emit FndzDaoDesiredTokenUpdated(address(0), _fndzDaoDesiredToken);
    }

    /// @notice Adds assets so that they may be used as the denomination asset of vaults
    /// @param _assets A list of denomination assets to approve
    function addDenominationAssets(address[] calldata _assets) external onlyOwner {
        for (uint256 i = 0; i < _assets.length; i++) {
            // check if Denomination Asset is unique
            require(
                approvedDenominationAssets[_assets[i]] == false,
                "addDenominationAssets: asset already added"
            );
            approvedDenominationAssets[_assets[i]] = true;
            emit DenominationAssetAdded(_assets[i]);
        }
    }

    /// @notice Removes assets so that they may not be used as the denomination asset of vaults
    /// @param _assets A list of denomination assets to remove
    function removeDenominationAssets(address[] calldata _assets) external onlyOwner {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(
                approvedDenominationAssets[_assets[i]] == true,
                "removeDenominationAssets: cannot remove a denomination that has not been added"
            );
            delete approvedDenominationAssets[_assets[i]];
            emit DenominationAssetRemoved(_assets[i]);
        }
    }

    /// @notice Returns true if the asset is approved to be used as the denomination asset of a vault
    /// @param _asset The token address to check
    function isDenominationAssetApproved(address _asset) external view returns (bool) {
        return approvedDenominationAssets[_asset];
    }

    /// @notice Sets the Uniswap V2 Router 02 address used for inline swaps
    /// @param _uniswapV2Router02 The Uniswap V2 Router 02 contract address
    function updateInlineSwapRouterAddress(address _uniswapV2Router02)
        external
        onlyOwner
        notZeroAddress(_uniswapV2Router02)
    {
        address oldRouter = uniswapV2Router02;
        uniswapV2Router02 = _uniswapV2Router02;
        emit InlineSwapRouterUpdated(oldRouter, _uniswapV2Router02);
    }

    /// @notice Returns the Uniswap V2 Router 02 address used for inline swaps
    function getInlineSwapRouterAddress() external view override returns (address) {
        return uniswapV2Router02;
    }

    /// @notice Sets the Uniswap V2 Factory address used for inline swap during inline fee redemption
    /// @param _uniswapV2Factory The Uniswap V2 Factory contract address
    function updateInlineSwapFactoryAddress(address _uniswapV2Factory)
        external
        onlyOwner
        notZeroAddress(_uniswapV2Factory)
    {
        address oldFactory = uniswapV2Factory;
        uniswapV2Factory = _uniswapV2Factory;
        emit InlineSwapFactoryUpdated(oldFactory, _uniswapV2Factory);
    }

    /// @notice Sets the FNDZ Staking Pool address to which fees are paid out
    /// @param _fndzStakingPool The FNDZ Staking Pool contract address
    function updateFndzStakingPoolAddress(address _fndzStakingPool)
        external
        onlyOwner
        notZeroAddress(_fndzStakingPool)
    {
        address oldStaking = fndzStakingPool;
        fndzStakingPool = _fndzStakingPool;
        emit FndzStakingPoolUpdated(oldStaking, _fndzStakingPool);
    }

    /// @notice Sets the FNDZ DAO address to which fees are paid out
    /// @param _fndzDao The FNDZ DAO contract address
    function updateFndzDaoAddress(address _fndzDao) external onlyOwner notZeroAddress(_fndzDao) {
        address oldDao = fndzDao;
        fndzDao = _fndzDao;
        emit FndzDaoUpdated(oldDao, _fndzDao);
    }

    /// @notice Sets the token to which fees owed to the FNDZ DAO will be attempted to be
    /// swapped to during inline fee share redemption. In order for the swap to work correctly, the
    /// desired token should be selected such that there exists a trading pool between it and each
    /// of the assets traded by the vaults. If a pool does not exist between the desired token and a
    /// trade asset, the trade asset will be sent to the FNDZ DAO without being swapped.
    /// @param _fndzDaoDesiredToken The address of the token in which the FNDZ DAO wishes to collect fee payments
    function updateFndzDaoDesiredToken(address _fndzDaoDesiredToken)
        external
        notZeroAddress(_fndzDaoDesiredToken)
    {
        require(
            msg.sender == fndzDao,
            "updateFndzDaoDesiredToken: function may only be called by the FNDZ DAO"
        );
        address oldToken = fndzDaoDesiredToken;
        fndzDaoDesiredToken = _fndzDaoDesiredToken;
        emit FndzDaoDesiredTokenUpdated(oldToken, _fndzDaoDesiredToken);
    }

    /// @notice Sets the Fund Deployer address
    /// @param _fundDeployer The Fund Deployer contract address
    function updateFundDeployerAddress(address _fundDeployer) external onlyOwner {
        address oldFundDeployer = fundDeployer;
        fundDeployer = _fundDeployer;
        emit FundDeployerUpdated(oldFundDeployer, _fundDeployer);
    }

    /// @notice Sets the ParaSwap Fee percentage collected by the FNDZ DAO
    /// @param _fee The fee percentage
    function updateParaSwapFee(uint256 _fee) external onlyOwner {
        require(0 <= _fee && _fee <= 10000, "_fee should be >=0 and <= 10000");
        paraSwapFee = _fee;
        emit ParaSwapFeeUpdated(_fee);
    }

    /// @notice Sets the FNDZShortingBot address 
    function updateFNDZShortingBotAddress(address _FNDZShortingBot)external onlyOwner {
        require(_FNDZShortingBot!=address(0),"should not be address(0)");
        FNDZShortingBot=_FNDZShortingBot; 
    }

    /// @notice Returns the FNDZShortingBot address 
    function getFNDZShortingBotAddress()external view override returns (address _FNDZShortingBot) {
           require(_FNDZShortingBot==address(0),"FNDZShortingBot's address is not set");
           return FNDZShortingBot; 
    }

    /// @notice Returns the current ParaSwapFee percentage
    function getParaSwapFee() external view override returns (uint256 _fee) {
        return paraSwapFee;
    }

    /// @notice Returns the current owner of the FNDZ Controller
    /// @return owner_ The owner address
    function getOwner() external view override returns (address owner_) {
        return owner();
    }

    /// @notice Sets the percentages of the management fee that are paid to the vault owner,
    /// to the FNDZ Staking Pool, and to the FNDZ DAO
    /// @param _vaultOwnerSplit The percentage of the management fee that goes to the Vault Owner
    /// @param _stakingAndDaoSplit The percentage of the management fee per beneficiary that goes
    /// to the FNDZ Staking Pool and the FNDZ DAO
    function updateManagementFeeSplit(uint256 _vaultOwnerSplit, uint256 _stakingAndDaoSplit)
        external
        onlyOwner
    {
        require(
            (_vaultOwnerSplit + (_stakingAndDaoSplit * 2)) == RATE_DIVISOR,
            "updateManagementFeeSplit: _vaultOwnerSplit + (_stakingAndDaoSplit * 2) must equal RATE_DIVISOR"
        );
        uint256 oldVaultOwnerSplit = managementFeeVaultOwnerSplit;
        uint256 oldStakingAndDaoSplit = managementFeeStakingAndDaoSplit;
        managementFeeVaultOwnerSplit = _vaultOwnerSplit;
        managementFeeStakingAndDaoSplit = _stakingAndDaoSplit;
        emit ManagementFeeSplitUpdated(
            oldVaultOwnerSplit,
            oldStakingAndDaoSplit,
            _vaultOwnerSplit,
            _stakingAndDaoSplit
        );
    }

    /// @notice Sets the base and max percentage of the performance fee that is sent to the vault owner,
    /// staked FNDZ Token amount for the Tier Zero, increment and the split percentage increase amount per tier
    /// @param _vaultOwnerSplitBase The minimum percentage of the fee that the Vault Owner receives
    /// @param _vaultOwnerSplitMax The maximum percentage of the fee that the Vault Owner receives
    /// @param _tierZeroStakedAmount The amount of FNDZ Tokens the vault owner must stake to qualify for Tier Zero
    /// @param _amountStakedIncrement The amount of additional FNDZ Tokens the vault owner must stake to qualify for subsequent tiers
    /// @param _vaultOwnerSplitIncreasePerTier The percentage increment of the fee that the Vault Owner unlocks per tier
    function updatePerformanceFeeSplit(
        uint256 _vaultOwnerSplitBase,
        uint256 _vaultOwnerSplitMax,
        uint256 _tierZeroStakedAmount,
        uint256 _amountStakedIncrement,
        uint256 _vaultOwnerSplitIncreasePerTier
    ) external onlyOwner {
        require(
            _vaultOwnerSplitBase <= RATE_DIVISOR,
            "updatePerformanceFeeSplit: _vaultOwnerSplitBase should be less than or equal to RATE_DIVISOR"
        );
        require(
            _vaultOwnerSplitMax <= RATE_DIVISOR,
            "updatePerformanceFeeSplit: _vaultOwnerSplitMax should be less than or equal to RATE_DIVISOR"
        );
        require(
            _vaultOwnerSplitIncreasePerTier <= RATE_DIVISOR,
            "updatePerformanceFeeSplit: _vaultOwnerSplitIncreasePerTier should be less than or equal to RATE_DIVISOR"
        );

        emit PerformanceFeeSplitUpdated(
            performanceFeeVaultOwnerSplitBase,
            _vaultOwnerSplitBase,
            performanceFeeVaultOwnerSplitMax,
            _vaultOwnerSplitMax,
            performanceFeeTierZeroAmountStaked,
            _tierZeroStakedAmount,
            performanceFeeAmountStakedIncrement,
            _amountStakedIncrement,
            performanceFeeVaultOwnerSplitIncreasePerTier,
            _vaultOwnerSplitIncreasePerTier
        );

        performanceFeeVaultOwnerSplitBase = _vaultOwnerSplitBase;
        performanceFeeVaultOwnerSplitMax = _vaultOwnerSplitMax;
        performanceFeeTierZeroAmountStaked = _tierZeroStakedAmount;
        performanceFeeAmountStakedIncrement = _amountStakedIncrement;
        performanceFeeVaultOwnerSplitIncreasePerTier = _vaultOwnerSplitIncreasePerTier;
    }

    /// @notice Sets the time and slippage allowances permitted for swaps during inline fee share redemption
    /// @param _swapDeadlineIncrement The number of seconds before the inline swap fails
    /// @param _swapMinimumPercentageReceived The minimum percent of the nominal swap destination amount
    function updateInlineSwapAllowances(
        uint256 _swapDeadlineIncrement,
        uint256 _swapMinimumPercentageReceived
    ) external onlyOwner {
        require(
            _swapMinimumPercentageReceived <= RATE_DIVISOR,
            "_swapMinimumPercentageReceived is greater than RATE_DIVISOR"
        );

        uint256 oldDeadlineIncrement = inlineSwapDeadlineIncrement;
        uint256 oldMinimumPercentageReceived = inlineSwapMinimumPercentReceived;
        inlineSwapDeadlineIncrement = _swapDeadlineIncrement;
        inlineSwapMinimumPercentReceived = _swapMinimumPercentageReceived;
        emit InlineSwapAllowancesUpdated(
            oldDeadlineIncrement,
            oldMinimumPercentageReceived,
            _swapDeadlineIncrement,
            _swapMinimumPercentageReceived
        );
    }

    /// @notice Returns the Management Fee Split data
    function getManagementFeeData()
        external
        view
        override
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            fndzStakingPool,
            fndzDao,
            managementFeeVaultOwnerSplit,
            managementFeeStakingAndDaoSplit,
            RATE_DIVISOR
        );
    }

    /// @notice Returns performance fee split data
    function getPerformanceFeeData(address _vaultOwner)
        external
        view
        override
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        )
    {
        uint256 amountStakedByVaultOwner = IFNDZStaking(fndzStakingPool).getStakedAmount(
            _vaultOwner
        );
        uint256 vaultOwnerSplit = Math.max(
            Math.min(
                performanceFeeVaultOwnerSplitBase.add(
                    Math
                        .max(amountStakedByVaultOwner, performanceFeeTierZeroAmountStaked)
                        .sub(performanceFeeTierZeroAmountStaked)
                        .div(performanceFeeAmountStakedIncrement)
                        .mul(performanceFeeVaultOwnerSplitIncreasePerTier)
                ),
                performanceFeeVaultOwnerSplitMax
            ),
            performanceFeeVaultOwnerSplitBase
        );

        uint256 stakingAndDaoSplit = RATE_DIVISOR.sub(vaultOwnerSplit).div(2);
        return (fndzStakingPool, fndzDao, vaultOwnerSplit, stakingAndDaoSplit, RATE_DIVISOR);
    }

    /// @notice Returns the data required to perform inline swaps during inline fee share redemption
    function getFeeInlineSwapData()
        external
        view
        override
        returns (
            address,
            address,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            uniswapV2Factory,
            fndzDaoDesiredToken,
            inlineSwapDeadlineIncrement,
            inlineSwapMinimumPercentReceived,
            RATE_DIVISOR
        );
    }

    /// @notice Store the fee settings for a given fee smart contract
    /// @param _feeAddress The fee smart contract address
    /// @param _parameterMinValues The minimum acceptable values for the parameters,
    /// in the same order as encoded for the fee contract's addFundSettings method
    /// @param _parameterMaxValues The maximum acceptable values for the parameters,
    /// in the same order as encoded for the fee contract's addFundSettings method
    function setFeeConfiguration(
        address _feeAddress,
        uint256[] calldata _parameterMinValues,
        uint256[] calldata _parameterMaxValues
    ) external onlyOwner {
        FeeConfiguration storage feeConfig = feeConfigurations[_feeAddress];
        feeConfig.valid = true;
        require(
            _parameterMinValues.length == _parameterMaxValues.length,
            "setFeeConfiguration: _parameterMinValues and _parameterMaxValues lengths must be equal"
        );
        feeConfig.parameterMinValues = _parameterMinValues;
        feeConfig.parameterMaxValues = _parameterMaxValues;
        emit FeeConfigurationUpdated(_feeAddress);
    }

    /// @notice Removes a fee configuration that was previous set
    /// @param _feeAddress The fee smart contract address
    function removeFeeConfiguration(address _feeAddress) external onlyOwner {
        require(
            feeConfigurations[_feeAddress].valid,
            "removeFeeConfiguration: fee configuration is not set"
        );
        delete feeConfigurations[_feeAddress];
        emit FeeConfigurationRemoved(_feeAddress);
    }

    /// @notice Returns the configuration for the given fee smart contract address
    /// @param _feeAddress The fee smart contract address
    function getFeeConfiguration(address _feeAddress)
        external
        view
        returns (FeeConfiguration memory)
    {
        return feeConfigurations[_feeAddress];
    }

    /// @notice Gatekeeper function for FundDeployer to ensure that only acceptable vaults are created
    /// @param _fundOwner The address of the owner for the fund
    /// @param _fundName The name of the fund
    /// @param _denominationAsset The contract address of the denomination asset for the fund
    /// @param _sharesActionTimelock The minimum number of seconds between any two "shares actions"
    /// (buying or selling shares) by the same user
    /// @param _feeManagerConfigData Bytes data for the fees to be enabled for the fund
    /// @param _policyManagerConfigData Bytes data for the policies to be enabled for the fund
    function createNewFund(
        address _fundOwner,
        string calldata _fundName,
        address _denominationAsset,
        uint256 _sharesActionTimelock,
        bytes calldata _feeManagerConfigData,
        bytes calldata _policyManagerConfigData
    ) external returns (address comptrollerProxy_, address vaultProxy_) {
        require(fundDeployer != address(0), "createNewFund: Fund Deployer not set");
        require(
            approvedDenominationAssets[_denominationAsset],
            "createNewFund: denomination asset is not approved"
        );
        (address[] memory fees, bytes[] memory settingsData) = abi.decode(
            _feeManagerConfigData,
            (address[], bytes[])
        );
        for (uint256 i; i < fees.length; i++) {
            FeeConfiguration memory feeConfig = feeConfigurations[fees[i]];
            require(feeConfig.valid == true, "createNewFund: Unknown fee");
            bytes memory encodedUint = new bytes(32);
            for (uint256 j = 0; j < feeConfig.parameterMinValues.length; j++) {
                uint256 start = 32 * j;
                encodedUint = BytesLib.slice(settingsData[i], start, 32);
                uint256 parameterValue = abi.decode(encodedUint, (uint256));
                require(
                    parameterValue >= feeConfig.parameterMinValues[j] &&
                        parameterValue <= feeConfig.parameterMaxValues[j],
                    "createNewFund: fee parameter value is not within the acceptable range"
                );
            }
        }
        return
            IFundDeployer(fundDeployer).createNewFund(
                _fundOwner,
                _fundName,
                _denominationAsset,
                _sharesActionTimelock,
                _feeManagerConfigData,
                _policyManagerConfigData
            );
    }
}
