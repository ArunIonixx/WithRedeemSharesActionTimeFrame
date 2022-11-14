// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "../fndz/utils/StakeOrderLinking.sol";

/// @notice - This contract is created to test the StakeOrderLinking functionalities
contract MockStakeOrderLinking is StakeOrderLinking {
    function addToStakeOrderLink(address _address) public {
        __addToStakeOrderLink(_address);
    }

    function removeFromStakeOrderLink(address _address) public {
        __removeFromStakeOrderLink(_address);
    }
}
