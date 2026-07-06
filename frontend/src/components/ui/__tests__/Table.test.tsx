import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table, THead, TH, TBody, TR, TD } from '../Table';

describe('Table', () => {
  it('renders children inside a table wrapper', () => {
    render(
      <Table>
        <TBody>
          <TR>
            <TD>cell</TD>
          </TR>
        </TBody>
      </Table>,
    );
    expect(screen.getByText('cell')).toBeInTheDocument();
  });

  it('applies card class to container', () => {
    const { container } = render(
      <Table>
        <tbody><tr><td /></tr></tbody>
      </Table>,
    );
    expect(container.firstElementChild!.className).toContain('card');
  });
});

describe('THead', () => {
  it('renders children with blue background', () => {
    const { container } = render(<THead><tr><th>header</th></tr></THead>);
    const thead = container.querySelector('thead');
    expect(thead?.className).toContain('bg-blue-50');
  });
});

describe('TH', () => {
  it('renders header text', () => {
    render(<TH>Name</TH>);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('applies left alignment by default', () => {
    const { container } = render(<TH>Default</TH>);
    expect(container.querySelector('th')?.className).toContain('text-left');
  });

  it('applies right alignment when align=right', () => {
    const { container } = render(<TH align="right">Right</TH>);
    expect(container.querySelector('th')?.className).toContain('text-right');
  });

  it('applies center alignment when align=center', () => {
    const { container } = render(<TH align="center">Center</TH>);
    expect(container.querySelector('th')?.className).toContain('text-center');
  });
});

describe('TBody', () => {
  it('renders children', () => {
    render(<TBody><tr><td>body cell</td></tr></TBody>);
    expect(screen.getByText('body cell')).toBeInTheDocument();
  });
});

describe('TR', () => {
  it('renders children with hover styles', () => {
    const { container } = render(<TR><td>row</td></TR>);
    expect(container.querySelector('tr')?.className).toContain('hover:bg-blue-50');
  });
});

describe('TD', () => {
  it('renders cell text', () => {
    render(<TD>value</TD>);
    expect(screen.getByText('value')).toBeInTheDocument();
  });

  it('applies left alignment by default', () => {
    const { container } = render(<TD>text</TD>);
    expect(container.querySelector('td')?.className).toContain('text-left');
  });

  it('applies right alignment when align=right', () => {
    const { container } = render(<TD align="right">text</TD>);
    expect(container.querySelector('td')?.className).toContain('text-right');
  });

  it('applies center alignment when align=center', () => {
    const { container } = render(<TD align="center">text</TD>);
    expect(container.querySelector('td')?.className).toContain('text-center');
  });

  it('merges custom className', () => {
    const { container } = render(<TD className="extra-class">text</TD>);
    expect(container.querySelector('td')?.className).toContain('extra-class');
  });
});
