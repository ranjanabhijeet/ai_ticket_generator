import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function CheckAuth({ children, protectedRoute, protected: legacyProtected }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const isProtected = protectedRoute ?? legacyProtected ?? false;

    if (isProtected) {
      if (!token) {
        navigate("/login");
      } else {
        setLoading(false);
      }
    } else {
      if (token) {
        navigate("/");
      } else {
        setLoading(false);
      }
    }
  }, [navigate, protectedRoute, legacyProtected]);

  if (loading) {
    return (
      <div className="container-app py-14">
        <div className="glass page-enter flex items-center justify-center gap-3 p-8 text-slate-300">
          <span className="loader" />
          <span>Checking session...</span>
        </div>
      </div>
    );
  }
  return children;
}

export default CheckAuth;
