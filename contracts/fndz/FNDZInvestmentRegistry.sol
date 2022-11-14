// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "../release/extensions/fee-manager/IFee.sol";
import "./interfaces/IFNDZInvestmentRegistry.sol";

/// @title FNDZInvestmentRegistry contract
/// @notice This contract handles storing locked FNDZ tokens of each fund
contract FNDZInvestmentRegistry is IFNDZInvestmentRegistry, OwnableUpgradeable {
    address public override fndzToken;
    address public feeAddress;
    mapping(address => uint256) private vaultProxyToLockedAmount;

    modifier onlyFromFee {
        require(msg.sender == feeAddress, "can only be called by the designated fee contract");
        _;
    }

    // Events
    event FeeAddressSet(address _old, address _new);
    event LockedAmountUpdated(address vaultProxy, uint256 lockedAmount);

    /// @notice While deploying this contract as proxy,
    /// this method is called to initialize the instance
    /// @param _fndzToken - address of the FNDZ token
    function initialize(address _fndzToken) public initializer {
        __Ownable_init();

        fndzToken = _fndzToken;
    }

    /// @notice - This method updates the locked amount of FNDZ Token of the Vault
    /// @param _vaultProxy - vault proxy address of the fund
    /// @param _lockedAmount - amount of FNDZ token locked
    function updateLockedAmount(address _vaultProxy, uint256 _lockedAmount)
        external
        override
        onlyFromFee
    {
        vaultProxyToLockedAmount[_vaultProxy] = _lockedAmount;
        emit LockedAmountUpdated(_vaultProxy, _lockedAmount);
    }

    /// @notice - returns the amount of locked FNDZ Tokens
    /// @param _vaultProxy - vault proxy address of the fund
    function getLockedAmount(address _vaultProxy)
        external
        view
        override
        returns (uint256 lockedAmount_)
    {
        return vaultProxyToLockedAmount[_vaultProxy];
    }

    /// @notice Set the fee address of the FNDZInvestmentFee.
    /// To restrict the access to that fee alone
    /// @param _feeAddress - address of the fee
    function setFeeAddress(address _feeAddress) external onlyOwner {
        address old = feeAddress;
        require(_feeAddress != address(0), "_feeAddress can not be zero address");
        require(_feeAddress != old, "_feeAddress already set");

        feeAddress = _feeAddress;
        emit FeeAddressSet(old, _feeAddress);
    }
}
