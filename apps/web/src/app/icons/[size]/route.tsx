import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export function GET(_req: Request, { params }: { params: { size: string } }) {
  const dim = parseInt(params.size) || 192;
  const radius = Math.round(dim * 0.2);
  const fontSize = Math.round(dim * 0.55);

  return new ImageResponse(
    <div
      style={{
        background: 'linear-gradient(135deg, #0891b2, #06b6d4)',
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: `${radius}px`,
        fontSize: `${fontSize}px`,
      }}
    >
      🐾
    </div>,
    { width: dim, height: dim },
  );
}
