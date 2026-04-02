import React from "react";
import { motion } from "framer-motion";
import "./Card.css";

/**
 * Reusable Card component — hover lift + scale 1.02, shadow, optional padding.
 */
export default function Card({
  children,
  className = "",
  padding = "md",
  hoverable = true,
  as: Tag = "div",
  onClick,
  ...props
}) {
  const paddingClass = padding ? `card--padding-${padding}` : "";
  const classes = [
    "card",
    paddingClass,
    hoverable && "card--hoverable",
    onClick && "card--clickable",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const Wrapper = hoverable ? motion.div : Tag;

  return (
    <Wrapper
      className={classes}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e);
              }
            }
          : undefined
      }
      {...(hoverable && {
        whileHover: { scale: 1.02 },
        transition: { duration: 0.2 },
      })}
      {...props}
    >
      {children}
    </Wrapper>
  );
}
