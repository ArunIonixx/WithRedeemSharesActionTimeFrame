// SPDX-License-Identifier: unlicensed
pragma solidity 0.6.12;

contract MockVaultCall {
    event ValueReceived(uint256 value);

    function receiveValue(uint256 _value) public {
        emit ValueReceived(_value);
    }
}
