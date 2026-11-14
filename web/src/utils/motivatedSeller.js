import { getListingAgeDays } from './listingDate';
import { getCarPriceDrop } from './priceHistory';

export const MIN_MOTIVATED_DAYS = 45;
export const MIN_MOTIVATED_DROPS = 2;

export const getMotivatedSellerInfo = (car, now = new Date()) => {
  if (!car || car.IsSold) return null;
  if (car.MarketFlag === 'typo' || car.MarketFlag === 'suspicious') return null;

  const days = getListingAgeDays(car, now);
  let drops = Number(car.PriceDrops) || 0;
  if (drops === 0 && getCarPriceDrop(car)) {
    drops = 1;
  }

  const isStale = days !== null && days >= MIN_MOTIVATED_DAYS;
  const hasMultipleDrops = drops >= MIN_MOTIVATED_DROPS;

  if (!isStale && !hasMultipleDrops) return null;

  return {
    days,
    drops,
    isStale,
    hasMultipleDrops,
  };
};
