// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
abstract contract IClaimHelper is Master {
    function getPriceFeedAddress(InsuranceCover memory cover)
        public
        view
        virtual
        returns (address priceFeedAddr);

    function isValidPastDevaluation(address priceFeedAddr, uint80 roundId)
        external
        view
        virtual
        returns (bool isValidDevaluation);

    function getPayoutOfCover(
        InsuranceCover memory cover,
        uint256 assetPrice,
        uint8 decimals
    ) public view virtual returns (uint256);

    function execExpiredPendingClaims(ListingType listingType, uint256 id)
        external
        virtual;

    function execExpiredPendingClaimsByCoverId(
        address priceFeedAddr,
        uint256 coverId
    ) public virtual;

    function checkValidityClaim(uint256 claimId) external virtual;

    function getPayoutOfRequest(
        uint256 requestId,
        CoverRequest memory coverRequest,
        uint256 assetPrice,
        uint8 decimals
    ) public view virtual returns (uint256);

    function isFunderHasPendingClaims(
        ListingType listingType,
        address funderAddr
    ) external view virtual returns (bool state);

    function isPendingClaimExistOnCover(uint256 coverId)
        external
        view
        virtual
        returns (bool statePendingClaimExists);

    function checkClaimForDevaluation(address aggregatorAddress, uint80 roundId)
        public
        view
        virtual
        returns (
            bool isValidClaim,
            uint256 assetPrice,
            uint8 decimals
        );

    function convertPrice(uint256[] memory withdrawable, uint256[] memory lock)
        external
        view
        virtual
        returns (
            uint256 totalWithdrawInUSD,
            uint256 totalLockInUSD,
            uint8 usdDecimals
        );
}
