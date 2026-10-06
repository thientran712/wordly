import AuthForm from "@/components/auth/AuthForm";

export const metadata = {
  title: "Đăng ký · Wordly",
};

export default function SignupPage() {
  return (
    <>
      <div className="bg-blobs">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
        <div className="blob blob-4"></div>
      </div>
      <main className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <AuthForm mode="signup" />
        </div>
      </main>
    </>
  );
}
