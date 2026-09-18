// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Confirmed } from '@/app/(portal)/request/confirmed/Confirmed';
const confirmation = {
  reference: 'TEST-123', submittedAt: '2026-09-17T12:00:00Z', companyName: 'Test customer', currency: 'CAD',
  details: {brand:'Fat Truck', serial:'Test serial', comments:{}, generalComment:'Test note', shipping:null},
  lines: [{partId:'p1',partNumberSnapshot:'P-1',descriptionSnapshot:'Test part',qty:2}], totals:{}, discountRate:0,
};
vi.mock('@/state/RequestContext', () => ({useRequest: () => ({lastConfirmation:confirmation,confirmationHydrated:true,submissionAvailable:true})}));
afterEach(() => {cleanup(); vi.restoreAllMocks();});
test('customer sees only the original left-hand document with print/PDF actions', () => {
  const {container} = render(<Confirmed usage={{}} />);
  expect(container.querySelectorAll('[data-quote-doc]')).toHaveLength(1);
  expect(screen.getByText('Factory quote request')).toBeTruthy();
  expect(screen.getByText('Requestor:').parentElement?.textContent).toContain('RUF DIAMOND LTD.');
  expect(screen.queryByText('Dealer logo')).toBeNull();
  const print = vi.spyOn(window, 'print').mockImplementation(() => {});
  fireEvent.click(screen.getByRole('button', {name:'Print'}));
  expect(print).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', {name:'Save PDF'}));
  expect(print).toHaveBeenCalledTimes(2);
});
