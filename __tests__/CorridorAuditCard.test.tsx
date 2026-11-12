import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CorridorAuditCard, CorridorAuditItem } from '../components/catalog/CorridorAuditCard';
import { RemediationTimeline } from '../components/catalog/RemediationTimeline';

describe('TASK-PW-CATALOG-UI: Corridor Audit Card & Remediation Timeline', () => {
  const dummyItem: CorridorAuditItem = {
    id: 'node-audit-1234',
    h3Res8: '8828308281fffff',
    parcelId: 'PIN-99210-A',
    latitude: 37.7749,
    longitude: -122.4194,
    timestamp: '2026-11-12T12:00:00Z',
    photoUrl: 'https://images.unsplash.com/before.jpg',
    remediatedPhotoUrl: 'https://images.unsplash.com/after.jpg',
    insideSchoolBuffer: true,
    nearestSchoolDistM: 180,
    luminanceNits: 520,
    communityStance: 'Remediated',
    decreeServedAt: '2026-11-10T10:00:00Z',
    remediatedAt: '2026-11-12T11:00:00Z',
    ocrText: 'BUY NOW PAY LATER - 50% OFF',
  };

  it('renders card with H3 cell, school buffer breach badge, and stance', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<CorridorAuditCard item={dummyItem} />);
    });

    const root = tree.root;
    const cellEl = root.findByProps({ 'data-testid': 'card-h3-cell' });
    expect(cellEl.props.children).toBe('8828308281fffff');

    const bufferBadge = root.findByProps({ 'data-testid': 'card-school-buffer-badge' });
    expect(bufferBadge.props.children).toContain('WITHIN 1,000FT SCHOOL BUFFER');

    const stanceBadge = root.findByProps({ 'data-testid': 'card-community-stance-badge' });
    expect(stanceBadge.props.children).toBe('Remediated');
  });

  it('renders before-after visual comparison slider when ad is remediated', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<CorridorAuditCard item={dummyItem} />);
    });

    const root = tree.root;
    const slider = root.findByProps({ 'data-testid': 'before-after-slider-container' });
    expect(slider).toBeTruthy();

    const rangeInput = root.findByProps({ 'aria-label': 'Before and after comparison slider' });
    expect(rangeInput).toBeTruthy();
    expect(rangeInput.props.value).toBe(50);

    // Simulate slider change
    act(() => {
      rangeInput.props.onChange({ target: { value: '75' } });
    });
  });

  it('expands and collapses remediation timeline on user toggle', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(<CorridorAuditCard item={dummyItem} />);
    });

    const root = tree.root;
    const toggleBtn = root.findByProps({ 'data-testid': 'toggle-timeline-btn' });
    expect(toggleBtn.props.children).toContain('EXPAND');

    // Toggle expand
    act(() => {
      toggleBtn.props.onClick();
    });

    const timeline = root.findByProps({ 'data-testid': 'remediation-timeline' });
    expect(timeline).toBeTruthy();
  });

  it('renders outside buffer badge when insideSchoolBuffer is false', () => {
    const outsideItem: CorridorAuditItem = {
      ...dummyItem,
      insideSchoolBuffer: false,
      communityStance: 'Deliberating',
    };

    let tree: any;
    act(() => {
      tree = renderer.create(<CorridorAuditCard item={outsideItem} />);
    });

    const root = tree.root;
    const bufferBadge = root.findByProps({ 'data-testid': 'card-school-buffer-badge' });
    expect(bufferBadge.props.children).toBe('OUTSIDE BUFFER');

    const stanceBadge = root.findByProps({ 'data-testid': 'card-community-stance-badge' });
    expect(stanceBadge.props.children).toBe('Deliberating');
  });

  it('renders all three timeline stages in RemediationTimeline component', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <RemediationTimeline
          currentStance="Decree Served"
          createdAt="2026-11-01"
          decreeServedAt="2026-11-05"
        />
      );
    });

    const root = tree.root;
    const timelineEl = root.findByProps({ 'data-testid': 'remediation-timeline' });
    expect(timelineEl).toBeTruthy();
  });
});
