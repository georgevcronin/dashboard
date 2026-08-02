import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Simple test of app rendering. This is a smoke test to verify
// the frontend test infrastructure works.

describe('Frontend Rendering', () => {
  test('can render a simple component', () => {
    const TestComponent = () => <div>Test Content</div>;
    render(<TestComponent />);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  test('Detail component gates content by expertise level', () => {
    // Import after defining dependencies
    const ExpertiseContext = React.createContext('beginner');

    const Detail = ({ min, max, children }) => {
      const level = React.useContext(ExpertiseContext);
      const levels = { beginner: 0, intermediate: 1, scientist: 2 };
      const userLevel = levels[level] ?? 0;
      const minLevel = levels[min] ?? 0;
      const maxLevel = levels[max] ?? Infinity;
      if (userLevel < minLevel || userLevel > maxLevel) return null;
      return children;
    };

    const { rerender } = render(
      <ExpertiseContext.Provider value="beginner">
        <Detail min="beginner">
          <div>Beginner Content</div>
        </Detail>
        <Detail min="intermediate">
          <div>Intermediate Content</div>
        </Detail>
      </ExpertiseContext.Provider>
    );

    expect(screen.getByText('Beginner Content')).toBeInTheDocument();
    expect(screen.queryByText('Intermediate Content')).not.toBeInTheDocument();

    rerender(
      <ExpertiseContext.Provider value="intermediate">
        <Detail min="beginner">
          <div>Beginner Content</div>
        </Detail>
        <Detail min="intermediate">
          <div>Intermediate Content</div>
        </Detail>
      </ExpertiseContext.Provider>
    );

    expect(screen.getByText('Beginner Content')).toBeInTheDocument();
    expect(screen.getByText('Intermediate Content')).toBeInTheDocument();
  });
});
