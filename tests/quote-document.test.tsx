// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Confirmed } from '@/app/(portal)/request/confirmed/Confirmed';
const confirmation = {
  reference: 'TEST-123', submittedAt: '2026-09-17T12:00:00Z', companyName: 'Test customer', currency: 'CAD',
  details: {brand:'Fat Truck', serial:'Test serial', comments:{}, generalComment:'Test note', shipping:null},
  lines: [{partId:'p1',partNumberSnapshot:'P-1',descriptionSnapshot:'Test part',qty:2}], totals:{}, discountRate:0,
};
const downloadSpy = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/app/(portal)/request/confirmed/quote-pdf', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  downloadQuotePdf: downloadSpy,
}));
vi.mock('@/state/RequestContext', () => ({useRequest: () => ({lastConfirmation:confirmation,confirmationHydrated:true,submissionAvailable:true})}));
afterEach(() => {cleanup(); vi.restoreAllMocks(); downloadSpy.mockReset(); downloadSpy.mockResolvedValue(undefined);});
test('customer sees only the original left-hand document with print/PDF actions', () => {
  const {container} = render(<Confirmed usage={{}} />);
  expect(container.querySelectorAll('[data-quote-doc]')).toHaveLength(1);
  expect(screen.getByText('Factory quote request')).toBeTruthy();
  expect(screen.getByText('Requestor:').parentElement?.textContent).toContain('RUF DIAMOND LTD.');
  expect(screen.queryByText('Dealer logo')).toBeNull();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', {name:'Print'}));
  expect(print).toHaveBeenCalledTimes(1);
});

test('Save PDF hands the confirmation to the downloader, not to the print dialogue', async () => {
  render(<Confirmed usage={{}} />);
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});

  fireEvent.click(screen.getByRole('button', {name:'Save PDF'}));

  await waitFor(() => expect(downloadSpy).toHaveBeenCalledTimes(1));
  expect(downloadSpy.mock.calls[0][0]).toMatchObject({reference: 'TEST-123'});
  // The whole point of the change: no print dialogue.
  expect(print).not.toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a failed save is reported rather than silently doing nothing', async () => {
  downloadSpy.mockRejectedValueOnce(new Error('no blob support'));
  render(<Confirmed usage={{}} />);

  fireEvent.click(screen.getByRole('button', {name:'Save PDF'}));

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('could not be generated');
});

test('the document itself carries the request, across as many pages as it needs', async () => {
  const { buildQuotePdf, quoteFileName } = await vi.importActual<
    typeof import('@/app/(portal)/request/confirmed/quote-pdf')
  >('@/app/(portal)/request/confirmed/quote-pdf');

  expect(quoteFileName('RDP-2026/09-1')).toBe('quote-request-RDP-2026-09-1.pdf');

  const many = {
    ...confirmation,
    lines: Array.from({length: 80}, (_, i) => ({
      partId: `p${i}`, partNumberSnapshot: `P-${i}`,
      descriptionSnapshot: 'A part with a long enough description to wrap its column', qty: 1,
    })),
  };
  const { doc, fileName } = await buildQuotePdf(many, {});
  expect(fileName).toBe('quote-request-TEST-123.pdf');
  // 80 lines do not fit one sheet; the table must carry on rather than clip.
  expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  const bytes = doc.output('arraybuffer') as ArrayBuffer;
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
});
