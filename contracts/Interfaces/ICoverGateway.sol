// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

abstract contract ICoverGateway is Master {
    function devWallet() external virtual returns (address);

    function buyCover(BuyCover calldata buyCoverData) external virtual;

    function provideCover(ProvideCover calldata provideCoverData)
        external
        virtual;

    function isRequestCoverSucceed(uint256 requestId)
        external
        view
        virtual
        returns (bool state);

    function getStartAt(uint256 coverId)
        external
        view
        virtual
        returns (uint256 startAt);

    function getEndAt(uint256 coverId)
        external
        view
        virtual
        returns (uint256 endAt);
}
