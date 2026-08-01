import { MapSearchService } from '../src/modules/inventory/application/map-search.service';
import type { MapSearchRepository } from '../src/modules/inventory/infrastructure/map-search.repository';
import type { MapSearchQuery } from '../src/modules/inventory/domain/map-types';
import { ValidationFailedError } from '../src/common/errors/domain-errors';

/**
 * Parsing only. The repository is a stub that records what it was handed, so
 * these assert the contract between the wire and the query — no database.
 */
function serviceWithSpy(): { service: MapSearchService; seen: () => MapSearchQuery } {
  let captured: MapSearchQuery | undefined;
  const repo = {
    search: (q: MapSearchQuery) => {
      captured = q;
      return Promise.resolve([]);
    },
  } as unknown as MapSearchRepository;

  return {
    service: new MapSearchService(repo),
    seen: () => {
      if (captured === undefined) throw new Error('repository was never called');
      return captured;
    },
  };
}

/** A viewport that passes every unrelated guard, so each test varies one thing. */
const viewport = {
  min_lng: '37.85',
  min_lat: '26.55',
  max_lng: '38.08',
  max_lat: '26.83',
};

describe('MapSearchService price bounds', () => {
  it('defaults both bounds to null when absent', async () => {
    const { service, seen } = serviceWithSpy();
    await service.search({ ...viewport });
    expect(seen().minPriceMinor).toBeNull();
    expect(seen().maxPriceMinor).toBeNull();
  });

  it('parses each bound independently', async () => {
    const { service, seen } = serviceWithSpy();
    await service.search({ ...viewport, min_price_minor: '20000' });
    expect(seen().minPriceMinor).toBe(20000);
    expect(seen().maxPriceMinor).toBeNull();
  });

  it('accepts a zero lower bound rather than treating it as absent', async () => {
    // 0 is a real floor and must not be confused with "no filter" — the usual
    // falsy-check bug, which would silently widen the guest's search.
    const { service, seen } = serviceWithSpy();
    await service.search({ ...viewport, min_price_minor: '0' });
    expect(seen().minPriceMinor).toBe(0);
  });

  it('accepts an equal min and max', async () => {
    const { service, seen } = serviceWithSpy();
    await service.search({
      ...viewport,
      min_price_minor: '50000',
      max_price_minor: '50000',
    });
    expect(seen().minPriceMinor).toBe(50000);
    expect(seen().maxPriceMinor).toBe(50000);
  });

  it('rejects an inverted range instead of returning an unexplained empty map', async () => {
    const { service } = serviceWithSpy();
    await expect(
      service.search({
        ...viewport,
        min_price_minor: '90000',
        max_price_minor: '10000',
      }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('rejects a fractional bound, which means the client sent major units', async () => {
    const { service } = serviceWithSpy();
    await expect(
      service.search({ ...viewport, max_price_minor: '145.5' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('rejects a negative bound', async () => {
    const { service } = serviceWithSpy();
    await expect(
      service.search({ ...viewport, min_price_minor: '-1' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('rejects a non-numeric bound', async () => {
    const { service } = serviceWithSpy();
    await expect(
      service.search({ ...viewport, min_price_minor: 'cheap' }),
    ).rejects.toBeInstanceOf(ValidationFailedError);
  });

  it('treats an empty string as absent, since that is what a cleared field sends', async () => {
    const { service, seen } = serviceWithSpy();
    await service.search({ ...viewport, min_price_minor: '', max_price_minor: '' });
    expect(seen().minPriceMinor).toBeNull();
    expect(seen().maxPriceMinor).toBeNull();
  });
});
