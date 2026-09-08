"""Review exports must fail closed and preserve existing reviewer files."""
import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from render_review import output_paths, validate_review

DATA = json.loads((Path(__file__).parent / 'review/proposals.json').read_text())


def test_export_rejects_stale_catalogue_before_claiming_it_is_unchanged():
    data = copy.deepcopy(DATA)
    data['catalogueSha256'] = '0' * 64
    try:
        validate_review(data)
        assert False, 'stale catalogue was accepted'
    except ValueError as error:
        assert 'Catalogue changed' in str(error)


def test_export_rejects_already_reviewed_or_approved_input():
    for field, value in [('status', 'APPROVED'), ('reviewer', 'Named reviewer')]:
        data = copy.deepcopy(DATA)
        data[field] = value
        try:
            validate_review(data)
            assert False, 'approved/reviewed input was accepted'
        except ValueError as error:
            assert 'unreviewed proposal' in str(error)


def test_export_does_not_overwrite_an_existing_review_file_by_default():
    with TemporaryDirectory(prefix='rufdiamond-review-test-') as directory:
        root = Path(directory)
        pdf, csv = output_paths(root)
        csv.write_text('reviewer correction: preserve me')
        try:
            output_paths(root)
            assert False, 'existing review output was accepted'
        except FileExistsError:
            pass
        assert csv.read_text() == 'reviewer correction: preserve me'
        assert not pdf.exists()


def test_export_requires_explicit_overwrite_or_a_new_directory():
    with TemporaryDirectory(prefix='rufdiamond-review-test-') as directory:
        root = Path(directory)
        pdf, _ = output_paths(root)
        pdf.write_bytes(b'original review')
        assert output_paths(root, overwrite=True)[0] == pdf
        assert not output_paths(root / 'revision-2')[0].exists()
        assert pdf.read_bytes() == b'original review'
