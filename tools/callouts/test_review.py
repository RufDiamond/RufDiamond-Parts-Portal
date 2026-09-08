"""Verify the review pack as evidence, never as customer publication approval."""
import hashlib
import json
from pathlib import Path

import ground_truth as gt

ROOT = Path(__file__).resolve().parents[2]
DATA = json.loads((Path(__file__).parent / 'review/proposals.json').read_text())


def test_all_44_supplied_plates_are_represented_exactly_once():
    figures = DATA['figures']
    assert len(figures) == len({f['figureId'] for f in figures}) == 44
    assert {ROOT / f['drawingPath'] for f in figures} == set((ROOT / 'public/drawings/ft3w').glob('*.png'))


def test_proposals_match_exact_source_versions_and_percentage_bounds():
    for figure in DATA['figures']:
        assert hashlib.sha256((ROOT / figure['drawingPath']).read_bytes()).hexdigest() == figure['sha256']
        for marker in figure['markers']:
            assert 0 <= marker['x'] <= 100 and 0 <= marker['y'] <= 100
            assert marker['number'] > 0
            assert marker['evidence'] and marker['confidence']


def test_number_set_differences_are_explicit_not_forced_to_match():
    for figure in DATA['figures']:
        expected = set(gt.expected_numbers(figure['figureId']))
        actual = {marker['number'] for marker in figure['markers']}
        assert figure['expectedNumbers'] == sorted(expected)
        assert figure['missingNumbers'] == sorted(expected - actual)
        assert figure['extraNumbers'] == sorted(actual - expected)


def test_nothing_is_approved_and_only_existing_oracle_positions_are_live():
    assert DATA['status'] == 'NOT_FOR_CUSTOMER_USE'
    assert DATA['reviewer'] is None
    # Approval-bound baseline at 0bd2156. A count alone would allow moving an
    # oracle or replacing it with a guess. Deliberately revise this guard only
    # in the future approved-application change, with its signed review record.
    assert hashlib.sha256(gt.SEED.read_bytes()).hexdigest() == 'df26ac87cbba1b0a88800d78459c225e93ce37a09e1d693196b1f92a507887c2'
    oracle_ids = {'fig-cabin-6-1', 'fig-filters-1-1'}
    for figure_id, _, x, y in gt.callouts():
        if figure_id in oracle_ids:
            assert x is not None and y is not None
        else:
            assert x is None and y is None
    for figure in DATA['figures']:
        assert figure['reviewStatus'] in ('existing-reference', 'pending-rufdiamond-signoff')


def test_repeated_printed_occurrences_are_retained_without_fabricating_associations():
    figure = next(f for f in DATA['figures'] if f['figureId'] == 'fig-cabin-6-13')
    assert figure['repeatedNumbers'] == [2, 3]
    for number in (2, 3):
        occurrences = [m for m in figure['markers'] if m['number'] == number]
        assert len(occurrences) == 2
        assert (occurrences[0]['x'], occurrences[0]['y']) != (occurrences[1]['x'], occurrences[1]['y'])
        assert all('figurePartId' not in marker for marker in occurrences)
    assert 'SOURCE CONFLICT' in figure['notes']


def test_hydraulic_source_only_numbers_include_the_top_edge_label_27():
    figure = next(f for f in DATA['figures'] if f['figureId'] == 'fig-hydraulic-4-1')
    assert figure['extraNumbers'] == [27, 28, 29]
    marker = next(m for m in figure['markers'] if m['number'] == 27)
    assert abs(marker['x'] - 23.67) < 1
    assert abs(marker['y'] - 2.22) < 1
