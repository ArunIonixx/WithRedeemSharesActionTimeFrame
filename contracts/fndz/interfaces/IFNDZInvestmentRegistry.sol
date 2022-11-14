// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

/// @title IFNDZInvestmentRegistry Interface
interface IFNDZInvestmentRegistry {
    function fndzToken() external view returns (address);

    function updateLockedAmount(address _vaultProxy, uint256 _lockedAmount) external;

    function getLockedAmount(address _vaultProxy) external view returns (uint256 lockedAmount_);
}
