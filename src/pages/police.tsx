import React, { useState, useRef } from 'react';

type StudentColor = 'bg-green-200' | 'bg-orange-200' | 'bg-red-400';
type DeskColor = 'bg-green-100' | 'bg-orange-100' | 'bg-red-200';
type Desk = {
  desk: DeskColor;
  students: [StudentColor, StudentColor];
};
type Layout = Desk[][];

const ClassroomBehavior: React.FC = () => {
  const initialLayout: Layout = [
    Array(3).fill({ desk: 'bg-green-100', students: ['bg-green-200', 'bg-green-200'] }),
    Array(3).fill({ desk: 'bg-green-100', students: ['bg-green-200', 'bg-green-200'] }),
    Array(3).fill({ desk: 'bg-green-100', students: ['bg-green-200', 'bg-green-200'] }),
    Array(4).fill({ desk: 'bg-green-100', students: ['bg-green-200', 'bg-green-200'] }),
  ];

  const [layout, setLayout] = useState<Layout>(initialLayout);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [startedDragging, setStartedDragging] = useState<boolean>(false);
  const [sliderPosition, setSliderPosition] = useState<number>(0);
  const sliderRef = useRef<HTMLDivElement>(null);

  const cycleColor = (color: StudentColor | DeskColor): StudentColor | DeskColor => {
    const colorMap: Record<StudentColor | DeskColor, StudentColor | DeskColor> = {
      'bg-green-100': 'bg-orange-100',
      'bg-orange-100': 'bg-red-200',
      'bg-red-200': 'bg-green-100',
      'bg-green-200': 'bg-orange-200',
      'bg-orange-200': 'bg-red-400',
      'bg-red-400': 'bg-green-200'
    };
    return colorMap[color];
  };

  const handleStudentClick = (colIndex: number, rowIndex: number, studentIndex: number, e: React.MouseEvent): void => {
    e.stopPropagation();
    const newLayout = layout.map((col, cIndex) => 
      cIndex === colIndex 
        ? col.map((desk, rIndex) =>
            rIndex === rowIndex
              ? {
                  ...desk,
                  students: desk.students.map((color, sIndex) =>
                    sIndex === studentIndex ? cycleColor(color) as StudentColor : color
                  ) as [StudentColor, StudentColor]
                }
              : desk
          )
        : col
    );
    setLayout(newLayout);
  };

  const handleDeskClick = (colIndex: number, rowIndex: number): void => {
    const newLayout = layout.map((col, cIndex) =>
      cIndex === colIndex
        ? col.map((desk, rIndex) =>
            rIndex === rowIndex
              ? {
                  desk: desk.students.some(student => student === 'bg-red-400')
                    ? ('bg-red-100' as DeskColor)  // Forcer le type DeskColor
                    : cycleColor(desk.desk),
                  students: desk.students.some(student => student === 'bg-red-400')
                    ? ['bg-red-400', 'bg-red-400'] as [StudentColor, StudentColor]
                    : desk.students.map(() => 
                        desk.desk === 'bg-green-100' 
                          ? ('bg-orange-200' as StudentColor)
                          : desk.desk === 'bg-orange-100' 
                            ? ('bg-red-400' as StudentColor)
                            : ('bg-green-200' as StudentColor)
                      ) as [StudentColor, StudentColor]
                }
              : desk
          )
        : col
    ) as Layout;  // Force le type Layout sur tout le résultat
    setLayout(newLayout);
  };

  const handleReset = (): void => {
    setLayout(initialLayout);
    setSliderPosition(0);
    setStartedDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent): void => {
    if (sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clickX = clientX - rect.left;
      
      if (clickX <= 100) {
        setIsDragging(true);
        setStartedDragging(true);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent): void => {
    if (isDragging && sliderRef.current) {
      const rect = sliderRef.current.getBoundingClientRect();
      const maxWidth = rect.width - 80;
      const newPosition = Math.max(0, Math.min(e.clientX - rect.left, maxWidth));
      setSliderPosition(newPosition);
      
      if (newPosition >= maxWidth * 0.9) {
        handleReset();
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent): void => {
    if (isDragging && sliderRef.current) {
      e.preventDefault();
      const rect = sliderRef.current.getBoundingClientRect();
      const maxWidth = rect.width - 80;
      const newPosition = Math.max(0, Math.min(e.touches[0].clientX - rect.left, maxWidth));
      setSliderPosition(newPosition);
      
      if (newPosition >= maxWidth * 0.9) {
        handleReset();
      }
    }
  };

  const handleMouseUp = (): void => {
    if (isDragging && sliderRef.current) {
      setIsDragging(false);
      if (sliderPosition < (sliderRef.current.getBoundingClientRect().width - 80) * 0.9) {
        setSliderPosition(0);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-4xl mx-auto p-4 min-h-screen">
      
      {/* Zone des tables */}
      <div className="w-full mb-8">
        <div className="flex justify-between gap-4">
          {layout.map((column, colIndex) => (
            <div key={colIndex} className="flex flex-col gap-4 flex-1">
              {column.map((desk, rowIndex) => (
                <div
                  key={`${colIndex}-${rowIndex}`}
                  className={`${desk.desk} rounded-lg p-4 cursor-pointer transition-colors duration-200`}
                  onClick={() => handleDeskClick(colIndex, rowIndex)}
                >
                  <div className="flex justify-around">
                    {desk.students.map((studentColor, studentIndex) => (
                      <div
                        key={`${colIndex}-${rowIndex}-${studentIndex}`}
                        className={`${studentColor} w-8 h-8 rounded-full cursor-pointer transition-colors duration-200`}
                        onClick={(e) => handleStudentClick(colIndex, rowIndex, studentIndex, e)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Slider de réinitialisation */}
      <div 
        ref={sliderRef}
        className="w-full h-16 bg-gray-100 rounded-lg relative mb-4 touch-none select-none overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      >
        <div 
          className={`absolute top-2 left-0 h-12 bg-blue-100 rounded-lg transition-transform duration-200 
            flex items-center justify-center text-blue-800 font-semibold px-4
            cursor-grab active:cursor-grabbing`}
          style={{ 
            width: '80px',
            transform: `translateX(${sliderPosition}px)`,
          }}
        >
          →
        </div>
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 pointer-events-none">
          Glisser pour réinitialiser →
        </div>
      </div>
    </div>
  );
};

export default ClassroomBehavior;