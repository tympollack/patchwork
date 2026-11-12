import {
  dispatchAdThresholdWebhook,
  signHmacPayload,
  resetDispatcherCache,
  AdAuditNodeData,
} from '../src/services/webhookDispatcher';

describe('TASK-PW-TRACKER-BRIDGE: Webhook Dispatcher to Tracker and Valerie', () => {
  const dummySecret = 'test_secret_hmac_123';
  const dummyNode: AdAuditNodeData = {
    node_id: 'test-node-7788',
    h3_index_res8: '8828308281fffff',
    parcel_id: 'PARCEL-7788',
    latitude: 37.7749,
    longitude: -122.4194,
    unique_user_ports: 3,
    inside_school_buffer: true,
    ocr_raw_text: 'LUXURY CONDOS STARTING AT $1M',
  };

  beforeEach(() => {
    resetDispatcherCache();
    jest.clearAllMocks();
  });

  it('computes correct HMAC-SHA256 signature', () => {
    const payload = JSON.stringify({ hello: 'world' });
    const sig = signHmacPayload(payload, dummySecret);
    expect(sig).toHaveLength(64);
    // Verifying determinism
    expect(signHmacPayload(payload, dummySecret)).toBe(sig);
  });

  it('rejects dispatch when unique ports threshold < 3', async () => {
    const belowThresholdNode = { ...dummyNode, unique_user_ports: 2 };
    const mockFetch = jest.fn();

    const res = await dispatchAdThresholdWebhook(belowThresholdNode, {
      fetchFn: mockFetch as any,
    });

    expect(res.trackerSuccess).toBe(false);
    expect(res.valerieSuccess).toBe(false);
    expect(res.error).toContain('Threshold not reached: 2 ports');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('dispatches HMAC-signed payloads to Tracker and Valerie when threshold >= 3', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    const res = await dispatchAdThresholdWebhook(dummyNode, {
      sharedHmacSecret: dummySecret,
      fetchFn: mockFetch as any,
    });

    expect(res.trackerSuccess).toBe(true);
    expect(res.valerieSuccess).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify Tracker request
    const [trackerUrl, trackerOptions] = mockFetch.mock.calls[0];
    expect(trackerUrl).toContain('track.sunshade.icu');
    expect(trackerOptions.headers['X-SunShade-Signature']).toBeTruthy();
    const trackerBody = JSON.parse(trackerOptions.body);
    expect(trackerBody.project_slug).toBe('sunshade-tracker');
    expect(trackerBody.items[0].external_ref_id).toBe(`TASK-PW-REMEDIATE-${dummyNode.node_id}`);

    // Verify Valerie request
    const [valerieUrl, valerieOptions] = mockFetch.mock.calls[1];
    expect(valerieUrl).toContain('valerie.sunshade.icu');
    expect(valerieOptions.headers['X-SunShade-Signature']).toBeTruthy();
    const valerieBody = JSON.parse(valerieOptions.body);
    expect(valerieBody.patchwork_port_id).toBe(`port-${dummyNode.node_id}`);
    expect(valerieBody.flagged_categories).toContain('SCHOOL_BUFFER_BREACH');
  });

  it('retries with backoff on 5xx error until success or max retries', async () => {
    let callCount = 0;
    const mockFetch = jest.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: false, status: 503 });
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
    });

    const res = await dispatchAdThresholdWebhook(dummyNode, {
      sharedHmacSecret: dummySecret,
      maxRetries: 3,
      initialBackoffMs: 10,
      fetchFn: mockFetch as any,
    });

    expect(res.trackerSuccess).toBe(true);
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  it('idempotently skips duplicate webhook deliveries for the same node', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });

    // First delivery
    const firstRes = await dispatchAdThresholdWebhook(dummyNode, {
      sharedHmacSecret: dummySecret,
      fetchFn: mockFetch as any,
    });
    expect(firstRes.trackerSuccess).toBe(true);
    expect(firstRes.skippedDuplicate).toBeFalsy();

    // Duplicate delivery
    const dupRes = await dispatchAdThresholdWebhook(dummyNode, {
      sharedHmacSecret: dummySecret,
      fetchFn: mockFetch as any,
    });
    expect(dupRes.skippedDuplicate).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2); // Only called during first dispatch
  });
});
