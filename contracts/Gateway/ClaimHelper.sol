// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {CoverData} from "../Data/CoverData.sol";
import {ClaimData} from "../Data/ClaimData.sol";
import {ListingData} from "../Data/ListingData.sol";
import {PlatformData} from "../Data/PlatformData.sol";
import {CoverGateway} from "./CoverGateway.sol";
import {ListingGateway} from "./ListingGateway.sol";
import {Master} from "../Master/Master.sol";
import {Pool} from "../Capital/Pool.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ClaimHelper is Master {
    // State variables
    CoverGateway private coverGateway;
    ListingGateway private listingGateway;
    CoverData private coverData;
    ClaimData private claimData;
    ListingData private listingData;
    PlatformData private platformData;
    Pool private pool;
    uint256 private constant PHASE_OFFSET = 64;
    uint256 private constant STABLECOINS_STANDARD_PRICE = 1;

    // Events
    // Indicate there is a fund from expired claim payout that can be owned by platform/dev
    event ExpiredValidClaim(
        uint256 coverId,
        uint256 claimId,
        uint8 payoutCurrency,
        uint256 totalPayout
    );
    // Indicate there the fund from expired claim payout still belongs to funder
    event ExpiredInvalidClaim(uint256 coverId, uint256 claimId);

    event ExpiredValidCollectiveClaim(
        uint256 requestId,
        uint256 collectiveClaimId,
        uint8 payoutCurrency,
        uint256 totalPayout
    );
    event ExpiredInvalidCollectiveClaim(
        uint256 requestId,
        uint256 collectiveClaimId
    );

    function changeDependentContractAddress() external {
        // Only admin allowed to call this function
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        coverGateway = CoverGateway(cg.getLatestAddress("CG"));
        listingGateway = ListingGateway(cg.getLatestAddress("LG"));
        coverData = CoverData(cg.getLatestAddress("CD"));
        claimData = ClaimData(cg.getLatestAddress("CM"));
        listingData = ListingData(cg.getLatestAddress("LD"));
        platformData = PlatformData(cg.getLatestAddress("PD"));
        pool = Pool(cg.getLatestAddress("PL"));
    }

    /**
     * @dev Calculate payout amount of Cover (in case member create claim)
     */
    function getPayoutOfCover(
        InsuranceCover memory cover,
        uint256 assetPrice,
        uint8 decimals
    ) public view returns (uint256) {
        require(cover.listingType == ListingType.OFFER, "ERR_CLG_27");

        uint8 insuredSumCurrencyDecimals = cg.getCurrencyDecimal(
            uint8(
                listingData.getCoverOfferById(cover.offerId).insuredSumCurrency
            )
        );

        return
            calculatePayout(
                cover.insuredSum,
                insuredSumCurrencyDecimals,
                assetPrice,
                decimals
            );
    }

    function getPayoutOfRequest(
        uint256 requestId,
        CoverRequest memory coverRequest,
        uint256 assetPrice,
        uint8 decimals
    ) public view returns (uint256) {
        uint8 insuredSumCurrencyDecimals = cg.getCurrencyDecimal(
            uint8(coverRequest.insuredSumCurrency)
        );

        return
            calculatePayout(
                listingData.requestIdToInsuredSumTaken(requestId),
                insuredSumCurrencyDecimals,
                assetPrice,
                decimals
            );
    }

    function calculatePayout(
        uint256 insuredSum,
        uint8 insuredSumCurrencyDecimals,
        uint256 assetPrice,
        uint8 decimals
    ) internal pure returns (uint256) {
        uint256 devaluationPerAsset = (STABLECOINS_STANDARD_PRICE *
            (10**decimals)) - uint256(assetPrice);

        // Get payout in USD : insured sum * asset devaluation
        uint256 payoutInUSD = (insuredSum * devaluationPerAsset) /
            (10**insuredSumCurrencyDecimals);
        // Convert payout in USD to insured sum currency
        uint256 payout = (payoutInUSD * (10**insuredSumCurrencyDecimals)) /
            assetPrice;

        return payout;
    }

    /**
     * @dev Generate Round Id (using chainlinks formula)
     */
    function getRoundId(uint16 phase, uint64 originalId)
        public
        pure
        returns (uint80)
    {
        return uint80((uint256(phase) << PHASE_OFFSET) | originalId);
    }

    /**
     * @dev Split round id to phase id & aggregator round id
     */
    function parseIds(uint256 roundId) public pure returns (uint16, uint64) {
        uint16 phaseId = uint16(roundId >> PHASE_OFFSET);
        uint64 aggregatorRoundId = uint64(roundId);

        return (phaseId, aggregatorRoundId);
    }

    /**
     * @dev Find out median price based on round id (price feed from chainlink)
     * @dev Called when member check claim status\
     * @dev using weighted median formula
     */
    function getMedian(address priceFeedAddr, uint80 startRoundId)
        public
        view
        returns (uint256 medianPrice, uint8 decimals)
    {
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);

        // Get Phase Id & start original round id
        (uint16 phaseId, uint64 startOriginalRoundId) = parseIds(startRoundId);

        // Get Latest Round
        (, , uint256 timestampOfLatestRound, , ) = priceFeed.latestRoundData();

        // Get Event Round
        (, , uint256 timestampOfEvent, , ) = priceFeed.getRoundData(
            startRoundId
        );

        require(
            timestampOfEvent + cg.monitoringPeriod() < timestampOfLatestRound,
            "ERR_CLG_8"
        );

        // Initial Value
        uint64 currentOriginalRoundId = startOriginalRoundId;
        uint256[] memory priceArr = new uint256[](72 * 3);
        uint256[] memory timestampArr = new uint256[](72 * 3);
        uint256 startedAtTemp = timestampOfEvent;

        while (startedAtTemp <= timestampOfEvent + cg.monitoringPeriod()) {
            // Get Price
            (, int256 price, , uint256 timestamp, ) = priceFeed.getRoundData(
                getRoundId(phaseId, currentOriginalRoundId)
            );

            require(timestamp > 0, "ERR_CHNLNK_1");

            // update parameter value of loop
            startedAtTemp = timestamp;

            // Save value to array
            priceArr[(currentOriginalRoundId - startOriginalRoundId)] = uint256(
                price
            );
            timestampArr[
                (currentOriginalRoundId - startOriginalRoundId)
            ] = timestamp;

            // increment
            currentOriginalRoundId += 1;
        }

        // Initial Array for time diff
        uint256[] memory timeDiffArr = new uint256[](
            currentOriginalRoundId - startOriginalRoundId - 1
        );

        // Calculation for time different
        for (
            uint256 i = 0;
            i < (currentOriginalRoundId - startOriginalRoundId - 1);
            i++
        ) {
            if (i == 0) {
                timeDiffArr[0] = timestampArr[1] - timestampArr[0];
            } else if (
                i == (currentOriginalRoundId - startOriginalRoundId) - 2
            ) {
                timeDiffArr[i] =
                    (timestampOfEvent + cg.monitoringPeriod()) -
                    timestampArr[i];
            } else {
                timeDiffArr[i] = timestampArr[i + 1] - timestampArr[i];
            }
        }

        // Sorting
        quickSort(
            priceArr,
            timeDiffArr,
            0,
            (int64(currentOriginalRoundId) - int64(startOriginalRoundId) - 2) // last index of array
        );

        // Find Median Price
        uint256 commulativeSum = timestampOfEvent;
        uint256 selectedIndex;
        for (uint256 i = 0; i < timeDiffArr.length; i++) {
            commulativeSum += timeDiffArr[i];
            if (
                commulativeSum >=
                (timestampOfEvent + (cg.monitoringPeriod() / 2))
            ) {
                selectedIndex = i;
                break;
            }
        }

        return (priceArr[selectedIndex], priceFeed.decimals());
    }

    /**
     * @dev Quick Sort Sorting Algorithm, used for sorting price values of chainlink price feeds
     */
    function quickSort(
        uint256[] memory arr,
        uint256[] memory arr2,
        int256 left,
        int256 right
    ) public view {
        int256 i = left;
        int256 j = right;
        if (i == j) return;
        uint256 pivot = arr[uint256(left + (right - left) / 2)];

        while (i <= j) {
            while (arr[uint256(i)] < pivot) i++;
            while (pivot < arr[uint256(j)]) j--;
            if (i <= j) {
                (arr[uint256(i)], arr[uint256(j)]) = (
                    arr[uint256(j)],
                    arr[uint256(i)]
                );
                (arr2[uint256(i)], arr2[uint256(j)]) = (
                    arr2[uint256(j)],
                    arr2[uint256(i)]
                );
                i++;
                j--;
            }
        }

        if (left < j) quickSort(arr, arr2, left, j);
        if (i < right) quickSort(arr, arr2, i, right);
    }

    /**
    @dev check validity of devaluation claim
    @return isValidClaim bool as state of valid claim
    @return assetPrice is devaluation price per asset
    @return decimals is decimals of price feed
     */
    function checkClaimForDevaluation(address aggregatorAddress, uint80 roundId)
        public
        view
        returns (
            bool isValidClaim,
            uint256 assetPrice,
            uint8 decimals
        )
    {
        // Get median price and decimals
        (uint256 price, uint8 priceDecimals) = getMedian(
            aggregatorAddress,
            roundId
        );

        // threshold is a price that indicates stablecoins are devalued
        uint256 threshold = ((100 - cg.maxDevaluation()) *
            (STABLECOINS_STANDARD_PRICE * (10**priceDecimals))) / 100;
        // if price under threshold then its mark as devaluation
        // else mark as non-devaluation
        isValidClaim = price < threshold ? true : false;
        return (isValidClaim, price, priceDecimals);
    }

    /**
     * @dev Convert price from stablecoins curency to USD (Currently only support DAI, USDT, USDC)
     */
    function convertPrice(uint256[] memory withdrawable, uint256[] memory lock)
        external
        view
        returns (
            uint256 totalWithdrawInUSD,
            uint256 totalLockInUSD,
            uint8 usdDecimals
        )
    {
        usdDecimals = 6;

        // Loop every currency
        for (uint8 j = 0; j < uint8(CurrencyType.END_ENUM); j++) {
            uint8 assetDecimals = cg.getCurrencyDecimal(j);
            // Get latest price of stable coins
            string memory coinId = cg.getCurrencyName(j);
            address priceFeedAddr = platformData.getOraclePriceFeedAddress(
                coinId
            );
            AggregatorV3Interface priceFeed = AggregatorV3Interface(
                priceFeedAddr
            );
            (, int256 currentPrice, , , ) = priceFeed.latestRoundData();
            uint8 priceFeedDecimals = priceFeed.decimals();

            // Formula : total asset * price per asset from pricefeed * usd decimals / asset decimals / price feed decimal
            totalWithdrawInUSD += ((withdrawable[j] *
                uint256(currentPrice) *
                (10**usdDecimals)) /
                (10**assetDecimals) /
                (10**priceFeedDecimals));
            totalLockInUSD += ((lock[j] *
                uint256(currentPrice) *
                (10**usdDecimals)) /
                (10**assetDecimals) /
                (10**priceFeedDecimals));
        }

        return (totalWithdrawInUSD, totalLockInUSD, usdDecimals);
    }

    /**
     * @dev validate claim creation by looking at pricing in previous rounds that make up duration of 1 hour (cg.validationPreviousPeriod())
     */
    function isValidPastDevaluation(address priceFeedAddr, uint80 roundId)
        external
        view
        returns (bool isValidDevaluation)
    {
        isValidDevaluation = true;
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);
        // Get Phase Id & start original round id
        (uint16 phaseId, uint64 originalRoundId) = parseIds(roundId);
        // Call aggregator to Get Event Detail
        (, , uint256 eventStartedAt, , ) = priceFeed.getRoundData(roundId);
        uint256 prevStartedAt = 0;

        do {
            // deduct originalRoundId every iteration
            originalRoundId -= 1;

            // Call aggregator to get price and time
            (, int256 price, , uint256 timestamp, ) = priceFeed.getRoundData(
                getRoundId(phaseId, originalRoundId)
            );
            prevStartedAt = timestamp;
            require(uint256(price) > 0 && timestamp > 0, "ERR_PAST_VALUATION");

            // check price, must below standard/below 1$
            // threshold is a price that indicates stablecoins are devalued
            uint256 threshold = ((100 - cg.maxDevaluation()) *
                (STABLECOINS_STANDARD_PRICE * (10**priceFeed.decimals()))) /
                100;

            // Mark as non devaluation is eq or bigger tha nthreshold
            if (uint256(price) >= threshold) {
                isValidDevaluation = false;
                break;
            }

            // Will loop until check last 1 hour price (cg.validationPreviousPeriod())
        } while (
            prevStartedAt > eventStartedAt - cg.validationPreviousPeriod()
        );

        return isValidDevaluation;
    }

    /**
     * @dev Get chainlinks price feed address based on cover
     */
    function getPriceFeedAddress(InsuranceCover memory cover)
        public
        view
        returns (address priceFeedAddr)
    {
        string memory coinId = (cover.listingType == ListingType.REQUEST)
            ? listingData.getCoverRequestById(cover.requestId).coinId
            : listingData.getCoverOfferById(cover.offerId).coinId;
        priceFeedAddr = platformData.getOraclePriceFeedAddress(coinId);
    }

    /**
     * @dev check if any pending claim exists on cover , pending claim is a claim with state "Monitoring" and still on range of payout period
     */
    function isPendingClaimExistOnCover(uint256 coverId)
        external
        view
        returns (bool statePendingClaimExists)
    {
        InsuranceCover memory cover = coverData.getCoverById(coverId);
        address priceFeedAddr = getPriceFeedAddress(cover);

        // Price feed aggregator
        AggregatorV3Interface priceFeed = AggregatorV3Interface(priceFeedAddr);

        uint256[] memory claimIds = claimData.getCoverToClaims(coverId);

        // Loop all claim on the cover
        for (uint256 j = 0; j < claimIds.length; j++) {
            Claim memory claim = claimData.getClaimById(claimIds[j]);

            // check if any MONITORING claim and still on payout period
            // a.k.a check is there any claims that not yet trigger checkValidityAndPayout function
            if (claim.state == ClaimState.MONITORING) {
                // Call aggregator to get event tomestamp
                (, , , uint256 claimEventTimestamp, ) = priceFeed.getRoundData(
                    claim.roundId
                );

                if (
                    block.timestamp <=
                    (claimEventTimestamp +
                        cg.monitoringPeriod() +
                        cg.maxPayoutPeriod())
                ) {
                    statePendingClaimExists = true;
                    break;
                }
            }
        }
    }

    /**
     * @dev Check status of claim which already expired
     * @dev Expired claim is a claim that exceed the payout period
     */
    function execExpiredPendingClaims(ListingType listingType, uint256 id)
        external
        onlyInternal
    {
        // Price feed aggregator address
        string memory coinId = (listingType == ListingType.REQUEST)
            ? listingData.getCoverRequestById(id).coinId
            : listingData.getCoverOfferById(id).coinId;
        address priceFeedAddr = platformData.getOraclePriceFeedAddress(coinId);

        if (listingType == ListingType.REQUEST) {
            execExpiredPendingClaimsByRequestId(priceFeedAddr, id);
        } else {
            uint256[] memory coverIds = coverData.getCoversByOfferId(id);
            for (uint256 i = 0; i < coverIds.length; i++) {
                execExpiredPendingClaimsByCoverId(priceFeedAddr, coverIds[i]);
            }
        }
    }

    /**
     * @dev Check status of claim which already expired
     * @dev Expired claim is a claim that exceed the payout period
     */
    function execExpiredPendingClaimsByCoverId(
        address priceFeedAddr,
        uint256 coverId
    ) public onlyInternal {
        uint256[] memory claimIds = claimData.getCoverToClaims(coverId);

        for (uint256 j = 0; j < claimIds.length; j++) {
            Claim memory claim = claimData.getClaimById(claimIds[j]);
            if (claim.state == ClaimState.MONITORING) {
                AggregatorV3Interface priceFeed = AggregatorV3Interface(
                    priceFeedAddr
                );
                (, , uint256 startedAt, , ) = priceFeed.getRoundData(
                    claim.roundId
                );
                if (
                    block.timestamp >
                    (startedAt + cg.monitoringPeriod() + cg.maxPayoutPeriod())
                ) {
                    _checkValidityClaim(claimIds[j], priceFeedAddr);
                }
            }
        }
    }

    function execExpiredPendingClaimsByRequestId(
        address priceFeedAddr,
        uint256 requestId
    ) public onlyInternal {
        uint256[] memory collectiveClaimIds = claimData
            .getRequestToCollectiveClaims(requestId);

        for (uint256 j = 0; j < collectiveClaimIds.length; j++) {
            CollectiveClaim memory collectiveClaim = claimData
                .getCollectiveClaimById(collectiveClaimIds[j]);
            if (collectiveClaim.state == ClaimState.MONITORING) {
                AggregatorV3Interface priceFeed = AggregatorV3Interface(
                    priceFeedAddr
                );
                (, , uint256 startedAt, , ) = priceFeed.getRoundData(
                    collectiveClaim.roundId
                );
                if (
                    block.timestamp >
                    (startedAt + cg.monitoringPeriod() + cg.maxPayoutPeriod())
                ) {
                    _checkValidityCollectiveClaim(
                        collectiveClaimIds[j],
                        priceFeedAddr
                    );
                }
            }
        }
    }

    /**
     * @dev Check pending claim by claim id
     */
    function checkValidityClaim(uint256 claimId) external {
        uint256 coverId = claimData.claimToCover(claimId);
        InsuranceCover memory cover = coverData.getCoverById(coverId);

        // Price feed aggregator address
        address priceFeedAddr = getPriceFeedAddress(cover);

        _checkValidityClaim(claimId, priceFeedAddr);
    }

    /**
     * @dev Check pending claim by claim id
     */
    function _checkValidityClaim(uint256 claimId, address priceFeedAddr)
        internal
    {
        Claim memory claim = claimData.getClaimById(claimId);

        // For stablecoins devaluation will decided based on oracle
        (
            bool isClaimValid,
            uint256 assetPrice,
            uint8 decimals
        ) = checkClaimForDevaluation(priceFeedAddr, claim.roundId);

        uint256 coverId = claimData.claimToCover(claimId);
        InsuranceCover memory cover = coverData.getCoverById(coverId);

        if (isClaimValid) {
            // Get cover offer
            CoverOffer memory coverOffer = listingData.getCoverOfferById(
                cover.offerId
            );

            // Calculate Payout
            uint256 payout = 0;
            payout = getPayoutOfCover(cover, assetPrice, decimals);

            emit ExpiredValidClaim(
                coverId,
                claimId,
                uint8(coverOffer.insuredSumCurrency),
                payout
            );

            require(
                claimData.coverToPayout(coverId) + payout <= cover.insuredSum,
                "ERR_CLG_10"
            );

            // Set cover to payout
            claimData.setCoverToPayout(coverId, payout);

            // Update total payout of offer cover
            claimData.setOfferIdToPayout(cover.offerId, payout);

            // update state of claim
            claimData.updateClaimState(
                claimId,
                cover.offerId,
                ClaimState.VALID_AFTER_EXPIRED
            );

            // Update total fund that can be owned by platform
            claimData.addTotalExpiredPayout(
                coverOffer.insuredSumCurrency,
                payout
            );
        } else {
            // Emit events
            emit ExpiredInvalidClaim(coverId, claimId);

            // update state of claim
            claimData.updateClaimState(
                claimId,
                cover.offerId,
                ClaimState.INVALID_AFTER_EXPIRED
            );
        }
    }

    function _checkValidityCollectiveClaim(
        uint256 collectiveClaimId,
        address priceFeedAddr
    ) internal {
        CollectiveClaim memory collectiveClaim = claimData
            .getCollectiveClaimById(collectiveClaimId);

        // For stablecoins devaluation will decided based on oracle
        (
            bool isClaimValid,
            uint256 assetPrice,
            uint8 decimals
        ) = checkClaimForDevaluation(priceFeedAddr, collectiveClaim.roundId);
        // Get Cover id
        uint256 requestId = claimData.collectiveClaimToRequest(
            collectiveClaimId
        );

        if (isClaimValid) {
            CoverRequest memory coverRequest = listingData.getCoverRequestById(
                requestId
            );
            // Calculate Payout
            uint256 payout = getPayoutOfRequest(
                requestId,
                coverRequest,
                assetPrice,
                decimals
            );
            require(
                payout <= listingData.requestIdToInsuredSumTaken(requestId),
                "ERR_CLG_10"
            );
            // emit event
            emit ExpiredValidCollectiveClaim(
                requestId,
                collectiveClaimId,
                uint8(coverRequest.insuredSumCurrency),
                payout
            );
            // Update total payout of offer request
            claimData.setRequestIdToPayout(requestId, payout);

            // update state of claim
            claimData.updateCollectiveClaimState(
                collectiveClaimId,
                ClaimState.VALID_AFTER_EXPIRED
            );
            // Update total fund that can be owned by platform
            claimData.addTotalExpiredPayout(
                coverRequest.insuredSumCurrency,
                payout
            );
        } else {
            // emit event
            emit ExpiredInvalidCollectiveClaim(requestId, collectiveClaimId);
            // update state of claim
            claimData.updateCollectiveClaimState(
                collectiveClaimId,
                ClaimState.INVALID_AFTER_EXPIRED
            );
        }
    }

    function isFunderHasPendingClaims(
        ListingType listingType,
        address funderAddr
    ) external view returns (bool state) {
        uint256[] memory ids = (listingType == ListingType.OFFER)
            ? coverData.getFunderToCovers(funderAddr)
            : coverData.getFunderToRequestId(funderAddr);

        for (uint16 i = 0; i < ids.length; i++) {
            uint16 pendingClaims = (listingType == ListingType.OFFER)
                ? claimData.coverToPendingClaims(ids[i])
                : claimData.requestToPendingCollectiveClaims(ids[i]);

            if (pendingClaims > 0) return true;
        }
    }
}
