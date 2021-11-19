// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
abstract contract IPlatformData is Master {
    function getOraclePriceFeedAddress(string calldata symbol)
        external
        view
        virtual
        returns (address);
}
