// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

interface IFNDZStaking {
    function getStakedAmount(address) external view returns (uint256);
}
