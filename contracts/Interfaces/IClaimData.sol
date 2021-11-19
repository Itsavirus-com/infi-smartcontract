// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
abstract contract IClaimData is Master {
    // State Variables but treat as a view functions

    function requestIdToRoundId(uint256, uint80)
        external
        view
        virtual
        returns (bool);

    function totalExpiredPayout(CurrencyType)
        external
        view
        virtual
        returns (uint256);

    function isValidClaimExistOnRequest(uint256)
        external
        view
        virtual
        returns (bool);

    function requestIdToPayout(uint256) external view virtual returns (uint256);

    function offerIdToPayout(uint256) external view virtual returns (uint256);

    function offerToPendingClaims(uint256)
        external
        view
        virtual
        returns (uint16);

    function coverIdToRoundId(uint256, uint80)
        external
        view
        virtual
        returns (bool);

    function isValidClaimExistOnCover(uint256)
        external
        view
        virtual
        returns (bool);

    function collectiveClaimToRequest(uint256)
        external
        view
        virtual
        returns (uint256);

    function coverToPendingClaims(uint256)
        external
        view
        virtual
        returns (uint16);

    function requestToPendingCollectiveClaims(uint256)
        external
        view
        virtual
        returns (uint16);

    function claimToCover(uint256) external view virtual returns (uint256);

    function coverToPayout(uint256) external view virtual returns (uint256);

    // Functions

    function addClaim(
        uint256 coverId,
        uint256 offerId,
        uint80 roundId,
        uint256 roundTimestamp,
        address holder
    ) external virtual returns (uint256);

    function setCoverToPayout(uint256 coverId, uint256 payout) external virtual;

    function setOfferIdToPayout(uint256 offerId, uint256 payout)
        external
        virtual;

    function getCoverToClaims(uint256 coverId)
        external
        view
        virtual
        returns (uint256[] memory);

    function setCoverIdToRoundId(uint256 coverId, uint80 roundId)
        external
        virtual;

    function updateClaimState(
        uint256 claimId,
        uint256 offerId,
        ClaimState state
    ) external virtual;

    function getClaimById(uint256 claimId)
        external
        view
        virtual
        returns (Claim memory);

    function addCollectiveClaim(
        uint256 requestId,
        uint80 roundId,
        uint256 roundTimestamp,
        address holder
    ) external virtual returns (uint256);

    function setRequestIdToRoundId(uint256 requestId, uint80 roundId)
        external
        virtual;

    function setIsValidClaimExistOnRequest(uint256 requestId) external virtual;

    function updateCollectiveClaimState(
        uint256 collectiveClaimId,
        ClaimState state
    ) external virtual;

    function setRequestIdToPayout(uint256 requestId, uint256 payout)
        external
        virtual;

    function getCollectiveClaimById(uint256 collectiveClaimId)
        external
        view
        virtual
        returns (CollectiveClaim memory);

    function addTotalExpiredPayout(CurrencyType currencyType, uint256 amount)
        external
        virtual;

    function resetTotalExpiredPayout(CurrencyType currencyType)
        external
        virtual;

    function getRequestToCollectiveClaims(uint256 requestId)
        external
        view
        virtual
        returns (uint256[] memory);
}
