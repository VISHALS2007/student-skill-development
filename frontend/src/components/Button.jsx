import React from "react";
import "./Button.css";

const VARIANTS = ["primary", "secondary", "outline", "ghost", "danger"];
const SIZES = ["sm", "md", "lg"];

/**
 * Reusable Button component — LeetCode/GFG style.
 * Primary: gradient, rounded, hover scale. Disabled state styled.
 */
export default function Button({
  children,
  variant = "primary",
  size = "md",
  disabled = false,
  type = "button",
  className = "",
  onClick,
  fullWidth = false,
  leftIcon,
  rightIcon,
  ...props
}) {
  const variantClass = VARIANTS.includes(variant) ? variant : "primary";
  const sizeClass = SIZES.includes(size) ? size : "md";
  const classes = [
    "btn",
    `btn--${variantClass}`,
    `btn--${sizeClass}`,
    fullWidth && "btn--full",
    disabled && "btn--disabled",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type={type}
      className={classes}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {leftIcon && <span className="btn__icon btn__icon--left">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="btn__icon btn__icon--right">{rightIcon}</span>}
    </button>
  );
}
