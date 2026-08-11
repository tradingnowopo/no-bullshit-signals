export const metadata = {
  title: "No Bullshit Signals",
  description: "Market intelligence. No cards. No coffee grounds. No bullshit.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
