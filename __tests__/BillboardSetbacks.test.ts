import { checkBillboardSetbacks } from '../src/lib/checkBillboardSetbacks';
import { supabase } from '../src/lib/supabase';

const mockRpc = jest.fn();

jest.mock('../src/lib/supabase', () => ({
  supabase: {
    schema: jest.fn().mockImplementation((schemaName: string) => ({
      rpc: mockRpc,
    })),
    rpc: mockRpc,
  },
}));

describe('TASK-PW-POSTGIS-BUFFERS: PostGIS Spatial Buffer RPC for Billboard Setbacks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockReset();
  });

  it('throws an error if nodeId is empty or missing', async () => {
    await expect(checkBillboardSetbacks('')).rejects.toThrow('nodeId is required');
  });

  it('correctly invokes rpc with default 305m buffer and returns inside buffer payload', async () => {
    const mockRpcResponse = {
      inside_school_buffer: true,
      nearest_school_dist_m: 142.5,
      parcel_id: 'PIN-99210-A',
      parcel_owner: 'Metropolitan Billboard Holdings LLC',
      deed_address: '1004 Commercial Blvd',
    };

    mockRpc.mockResolvedValueOnce({
      data: mockRpcResponse,
      error: null,
    });

    const result = await checkBillboardSetbacks('test-node-uuid');

    expect(mockRpc).toHaveBeenCalledWith('check_billboard_setbacks', {
      p_node_id: 'test-node-uuid',
      p_buffer_meters: 305,
    });

    expect(result).toEqual(mockRpcResponse);
    expect(result.inside_school_buffer).toBe(true);
    expect(result.nearest_school_dist_m).toBeLessThanOrEqual(305);
  });

  it('correctly processes outside buffer payload when school is beyond buffer distance', async () => {
    const mockRpcResponse = {
      inside_school_buffer: false,
      nearest_school_dist_m: 540.2,
      parcel_id: 'PIN-88123-B',
      parcel_owner: 'Apex Out-of-Home LLC',
      deed_address: '400 Industrial Way',
    };

    mockRpc.mockResolvedValueOnce({
      data: mockRpcResponse,
      error: null,
    });

    const result = await checkBillboardSetbacks('test-node-uuid-2', 305);

    expect(result.inside_school_buffer).toBe(false);
    expect(result.nearest_school_dist_m).toBe(540.2);
  });

  it('handles custom buffer meters override', async () => {
    mockRpc.mockResolvedValueOnce({
      data: {
        inside_school_buffer: false,
        nearest_school_dist_m: 600,
        parcel_id: null,
        parcel_owner: null,
      },
      error: null,
    });

    await checkBillboardSetbacks('test-node-uuid-3', 500);

    expect(mockRpc).toHaveBeenCalledWith('check_billboard_setbacks', {
      p_node_id: 'test-node-uuid-3',
      p_buffer_meters: 500,
    });
  });

  it('throws when supabase rpc reports an error', async () => {
    mockRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database connection failed' },
    });

    await expect(checkBillboardSetbacks('test-node-uuid-err')).rejects.toThrow(
      'Failed to check billboard setbacks: Database connection failed'
    );
  });
});
